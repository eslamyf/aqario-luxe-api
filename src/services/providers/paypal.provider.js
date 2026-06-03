const BaseProvider = require('./baseProvider');
const logger = require('../../utils/logger');

const readResponseData = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
};

const postJson = async (url, body, headers = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await readResponseData(res);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.response = { data };
    throw err;
  }
  return { data };
};

const postForm = async (url, formBody, headers = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: formBody,
  });
  const data = await readResponseData(res);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.response = { data };
    throw err;
  }
  return { data };
};

// ─────────────────────────────────────────────────────────────────
// PayPal Provider
// ─────────────────────────────────────────────────────────────────
// Supports: Credit Cards, PayPal Wallet
// Webhook: POST to /webhook/paypal
// ─────────────────────────────────────────────────────────────────

class PaypalProvider extends BaseProvider {
  constructor() {
    super('PayPal');
    this.clientId = process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    this.webhookId = process.env.PAYPAL_WEBHOOK_ID;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.apiUrl = this.isProduction
      ? 'https://api.paypal.com/v2'
      : 'https://api-m.sandbox.paypal.com/v2';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Missing PayPal configuration in .env');
    }
  }

  /**
   * Create payment
   * 1. Get access token
   * 2. Create order
   * 3. Return approval URL
   */
  async createPayment(data) {
    try {
      const { amount, paymentId, currency, propertyName } = data;

      logger.info(`[PayPal] Creating payment: ${paymentId}, amount: ${amount}`);

      // Step 1: Get access token
      const accessToken = await this.getAccessToken();

      // Step 2: Create order
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency || 'USD',
              value: String(amount),
              breakdown: {
                item_total: {
                  currency_code: currency || 'USD',
                  value: String(amount),
                },
              },
            },
            description: `Booking for ${propertyName}`,
            items: [
              {
                name: propertyName,
                unit_amount: {
                  currency_code: currency || 'USD',
                  value: String(amount),
                },
                quantity: '1',
              },
            ],
            custom_id: paymentId, // Link to our payment ID
          },
        ],
        application_context: {
          return_url: `${process.env.APP_URL || 'http://localhost:3000'}/checkout/success`,
          cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/checkout/cancel`,
          brand_name: 'Real Estate Platform',
          user_action: 'PAY_NOW',
          payment_method: {
            payer_selected: 'PAYPAL',
            payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
          },
        },
      };

      const orderResponse = await postJson(`${this.apiUrl}/checkout/orders`, orderData, {
        Authorization: `Bearer ${accessToken}`,
      });

      const orderId = orderResponse.data.id;
      const approvalUrl = orderResponse.data.links?.find((link) => link.rel === 'approve')?.href;

      logger.info(`[PayPal] Order created: ${orderId}`);

      return {
        paymentKey: orderId,
        paymentUrl: approvalUrl,
        metadata: {
          orderId,
          intent: 'CAPTURE',
        },
      };
    } catch (err) {
      logger.error('[PayPal] createPayment error:', err.response?.data || err.message);
      throw new Error(`PayPal payment creation failed: ${err.message}`);
    }
  }

  /**
   * Verify payment by capturing order
   */
  async verifyPayment(paymentKey) {
    try {
      logger.info(`[PayPal] Verifying order: ${paymentKey}`);

      const accessToken = await this.getAccessToken();

      // Retrieve order details
      const response = await fetch(`${this.apiUrl}/checkout/orders/${paymentKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to retrieve PayPal order: HTTP ${response.status}`);
      }

      const order = await response.json();
      logger.info(`[PayPal] Order status retrieved: ${order.status}`);

      let captureData;

      if (order.status === 'APPROVED') {
        // Capture approved order
        captureData = await this.captureOrder(paymentKey);
      } else if (order.status === 'COMPLETED') {
        // Order is already captured
        captureData = order;
      } else {
        return {
          success: false,
          error: `PayPal order status is ${order.status}`,
        };
      }

      // Extract transaction ID from the first capture of the purchase unit
      const purchaseUnit = captureData.purchase_units?.[0];
      const capture = purchaseUnit?.payments?.captures?.[0];
      const transactionId = capture?.id || paymentKey; // Fallback to paymentKey if ID not found

      return {
        success: true,
        transactionId,
        metadata: {
          orderId: paymentKey,
          status: captureData.status,
          amount: purchaseUnit?.amount?.value || order.purchase_units?.[0]?.amount?.value,
          currency: purchaseUnit?.amount?.currency_code || order.purchase_units?.[0]?.amount?.currency_code,
        },
      };
    } catch (err) {
      logger.error('[PayPal] verifyPayment error:', err.message);
      throw err;
    }
  }

  /**
   * Handle webhook from PayPal (CHECKOUT.ORDER.COMPLETED)
   */
  async handleWebhook(payload, payment) {
    try {
      logger.info(`[PayPal] Handling webhook for payment: ${payment._id}`);

      // Extract event type
      const eventType = payload.event_type;

      if (eventType !== 'CHECKOUT.ORDER.COMPLETED' && eventType !== 'PAYMENT.SALE.COMPLETED') {
        logger.warn(`[PayPal] Unhandled webhook type: ${eventType}`);
        return {
          success: false,
          error: 'Unhandled event type',
        };
      }

      const resource = payload.resource;

      if (resource.status !== 'APPROVED' && resource.status !== 'COMPLETED') {
        logger.error('[PayPal] Payment not approved:', resource.status);
        return {
          success: false,
          error: 'Payment not approved',
        };
      }

      // Extract transaction ID
      const transactionId = resource.id;

      // Verify purchase units
      const purchaseUnit = resource.purchase_units?.[0];
      if (!purchaseUnit) {
        return {
          success: false,
          error: 'Invalid purchase unit',
        };
      }

      // Capture the payment (if not already captured)
      if (resource.status === 'APPROVED') {
        const captured = await this.captureOrder(resource.id);
        if (captured.status !== 'COMPLETED') {
          return {
            success: false,
            error: 'Failed to capture payment',
          };
        }
      }

      logger.info(`[PayPal] Payment successful! Transaction ID: ${transactionId}`);

      return {
        success: true,
        transactionId,
        metadata: {
          orderId: resource.id,
          status: resource.status,
          amount: purchaseUnit.amount.value,
          currency: purchaseUnit.amount.currency_code,
        },
      };
    } catch (err) {
      logger.error('[PayPal] handleWebhook error:', err);
      throw err;
    }
  }

  /**
   * Capture PayPal order
   */
  async captureOrder(orderId) {
    try {
      const accessToken = await this.getAccessToken();

      const response = await postJson(`${this.apiUrl}/checkout/orders/${orderId}/capture`, {}, {
        Authorization: `Bearer ${accessToken}`,
      });

      return response.data;
    } catch (err) {
      logger.error('[PayPal] captureOrder error:', err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Refund payment
   */
  async refund(transactionId) {
    try {
      logger.info(`[PayPal] Refunding transaction: ${transactionId}`);

      const accessToken = await this.getAccessToken();

      // Full refund (amount omitted) — PayPal will refund the entire captured amount.
      const response = await postJson(`${this.apiUrl}/payments/captures/${transactionId}/refund`, {}, {
        Authorization: `Bearer ${accessToken}`,
      });

      return {
        transactionId: response.data.id,
      };
    } catch (err) {
      logger.error('[PayPal] refund error:', err);
      throw new Error(`PayPal refund failed: ${err.message}`);
    }
  }

  /**
   * Get PayPal access token
   */
  async getAccessToken() {
    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await postForm(
        `${this.apiUrl.replace('/v2', '')}/v1/oauth2/token`,
        'grant_type=client_credentials',
        { Authorization: `Basic ${auth}` }
      );

      return response.data.access_token;
    } catch (err) {
      logger.error('[PayPal] getAccessToken error:', err.response?.data || err.message);
      throw new Error('Failed to get PayPal access token');
    }
  }
}

module.exports = PaypalProvider;
