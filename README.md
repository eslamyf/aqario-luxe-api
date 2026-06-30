# Aqario Luxe Backend API

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-v20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.2.1-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-ioredis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Server-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![Jest](https://img.shields.io/badge/Jest-30.3.0-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

**Aqario Luxe API** is the production-ready, highly secure RESTful API backend for the *Aqario Luxe Real Estate Management System*. Built on Express 5, Mongoose, and Redis, it handles complex role-based access control, real-time client-agent communication, payment workflows, media file processing, Excel reports exporting, and system auditing.

[**Explore Frontend Web Repository ➔**](https://github.com/eslamyf/aqario-luxe-web)

---

</div>

## 📌 Table of Contents
- [✨ Core Features](#-core-features)
- [🏗️ Backend Architecture](#️-backend-architecture)
- [🛡️ Security Implementation](#️-security-implementation)
- [📦 Dependencies & Services](#-dependencies--services)
- [⚙️ Environment Variables](#️-environment-variables)
- [🚀 Local Setup & Installation](#-local-setup--installation)
- [🛠️ Available Scripts](#️-available-scripts)
- [🛢️ Seeding the Database](#️-seeding-the-database)
- [🧪 Testing & Linting](#-testing--linting)

---

## ✨ Core Features

### 🔐 Authentication & Access Control (RBAC)
*   **Double-Token JWT Auth:** Secure cookie/header token exchanges with short-lived access tokens (15m) and persistent database-backed refresh tokens.
*   **Google OAuth 2.0:** One-click OAuth login handler utilizing Google Auth Libraries.
*   **Role-Based Middleware:** Granular route protection restricting access to `Admin`, `Agent`, or standard `User` endpoints.

### 🏠 Property, Booking, and Auction Engine
*   **Property Model:** Supports locations, specs, multi-image fields, custom pricing (sale, rent, luxury), agent association, and features list.
*   **Auctions & Bidding:** Database-backed scheduling for properties with live updates dispatched via websockets.
*   **Booking System:** Schedule management for viewings and virtual visits.

### 💳 Double Gateway Payments (Paymob & PayPal)
*   **Paymob Integration:** Local credit card checkout and digital wallets with secure Webhook payload validation.
*   **PayPal Integration:** Sandbox checkout pipeline matching global standard transactions.
*   **Subscriptions:** Premium monthly/yearly package structures for agent promotions and premium listings limits.

### 📊 Admin Tools & Reports
*   **Audit Logging:** Detailed schema tracing of user actions (IP address, endpoints visited, actions committed) to ensure platform security.
*   **Excel Export (`exceljs`):** Generate downloadable sheets containing real estate listings and agency transactions.
*   **KYC Portal API:** Endpoint controls handling file verification uploads for verifying agents.

---

## 🏗️ Backend Architecture

The application adopts a modular MVC-style architecture in the [src/](file:///g:/Projects/mean-stack-real-estate/aqario-luxe-api/src) directory:

```
aqario-luxe-api/src/
├── config/                 # Setup modules for MongoDB, Redis, Socket.io, Cloudinary, and i18n
├── controllers/            # Request handlers separating business logic from route definitions
├── docs/                   # Swagger Open API docs configuration
├── jobs/                   # Node-cron automated cron schedules (e.g. daily auction endings)
├── locales/                # JSON translation files for multi-language responses
├── middlewares/            # Auth gates, RBAC checkers, request rate-limiters, and error interceptors
├── models/                 # Mongoose schema definitions (23+ collections including Property, User, Booking)
├── routes/                 # Express routing trees mapping entrypoints to controllers
├── seeds/                  # Seed scripts for bootstrapping local databases (Admins, Listings, Enterprise configurations)
├── services/               # Third-party integrations (Nodemailer, Cloudinary, Paymob, PayPal)
├── utils/                  # Custom logging mechanisms (Winston), API response utilities, and helpers
├── validators/             # Request payload sanitization and Joi schema verification
└── server.js               # Entrypoint file establishing server listeners, websockets, and connection queues
```

---

## 🛡️ Security Implementation

The API service integrates top-tier security standards to defend against web vulnerabilities:
*   **Helmet Headers:** Secures HTTP response headers against clickjacking and cross-site scripts.
*   **Express Rate Limiter:** Protects auth endpoints against brute-force and request flooding.
*   **Data Sanitization:** 
    *   `xss-clean` prevents malicious HTML/JS insertions.
    *   `express-mongo-sanitize` shields queries against NoSQL Injection injections.
*   **HPP:** Prevents HTTP Parameter Pollution attacks.
*   **Data Validation:** Strong Schema constraints via `Joi` and `express-validator` blocks invalid input models before database insertion.

---

## 📦 Dependencies & Services

*   **Express (`^5.2.1`):** The next-gen Express framework optimizing async routes, promise resolutions, and middle routing.
*   **Mongoose (`^9.3.3`):** MongoDB Object Modeling mapping strict schemas to collections.
*   **IoRedis (`^5.10.1`):** High-performance Redis client for caching and pub/sub messaging.
*   **Socket.IO (`^4.8.3`):** Real-time full-duplex socket server managing instant chats and broadcast events.
*   **Winston (`^3.19.0`):** Production logger logging error rotations into `.log` files.
*   **Cloudinary & Multer:** Multipart form parser handling buffer uploads and transmitting them directly to cloud storage.

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory. Template configurations (exclude secret values in production):

```env
# SERVER CONFIGURATION
PORT=5002
NODE_ENV=development
CLIENT_URL=http://localhost:4200

# DATABASE
MONGO_URI=mongodb://<username>:<password>@<host>:27017/<db_name>?authSource=admin

# AUTHENTICATION (JWT)
JWT_SECRET=your_super_secret_jwt_key
JWT_REFRESH_SECRET=your_super_secret_jwt_refresh_key
JWT_EXPIRES_IN=15m

# GOOGLE OAUTH
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com

# EMAIL SERVICE (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# CLOUDINARY (IMAGE UPLOADS)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# PAYMOB CONFIGURATION
PAYMOB_API_KEY=your_paymob_api_key
PAYMOB_WEBHOOK_SECRET=your_paymob_webhook_secret
PAYMOB_INTEGRATION_ID=your_paymob_integration_id
PAYMOB_IFRAME_ID=your_paymob_iframe_id

# PAYPAL CONFIGURATION
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
```

---

## 🚀 Local Setup & Installation

### Prerequisites
*   **Node.js:** v18.x or v20.x
*   **MongoDB:** Running instance locally or via MongoDB Atlas
*   **Redis:** Local server or Redis Cloud instance

### 1. Clone the API Repository
```bash
git clone https://github.com/eslamyf/aqario-luxe-api.git
cd aqario-luxe-api
```

### 2. Install Packages
```bash
npm install
```

### 3. Setup Environments
Create and configure your `.env` file in the root using the template above.

### 4. Start Dev Server (Nodemon)
```bash
npm run dev
```
The server will bind and start listening on **`http://localhost:5002`**.

---

## 🛠️ Available Scripts

Execute scripts using `npm run <script-name>`:

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run dev` | `nodemon src/server.js` | Launches dev server with hot-reload via nodemon |
| `npm start` | `node src/server.js` | Boots production server listener |
| `npm run start:prod` | `cross-env NODE_ENV=prod...` | Boots production server under strict production flag |
| `npm run lint` | `eslint src/` | Checks Javascript file styles |
| `npm run docs` | `node src/docs/swagger.js` | Generates Swagger configurations |

---

## 🛢️ Seeding the Database

Bootstrap your database collections with default roles, credentials, and luxury listings using the seeding engine:

*   **Seed Admin Accounts:**
    ```bash
    npm run seed:admin
    ```
*   **Seed Standard Properties:**
    ```bash
    npm run seed:properties
    ```
*   **Seed Luxury Properties:**
    ```bash
    npm run seed:luxe
    ```
*   **Seed Enterprise Configurations:**
    ```bash
    npm run seed:enterprise
    ```
*   **Seed All Core Settings (Admin + Enterprise):**
    ```bash
    npm run seed:all
    ```

---

## 🧪 Testing & Linting

Test files are run via **Jest** alongside **MongoDB Memory Server** for sandbox execution:

*   **Run All Unit Tests:**
    ```bash
    npm test
    ```
*   **Run Tests in Watch Mode:**
    ```bash
    npm run test:watch
    ```
*   **Generate Test Coverage Report:**
    ```bash
    npm run test:coverage
    ```

---

<div align="center">
Made with ❤️ by Eslam Yasser
</div>
