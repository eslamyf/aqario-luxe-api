const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');

router.get('/', agentController.getAgents);

module.exports = router;
