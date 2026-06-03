const User = require('../models/user.model');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/v1/agents
 * Fetch all users with agent role and return dynamically structured agent information
 */
exports.getAgents = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: ['agent', 'owner'] } }).lean();

  const specialties = [
    'Luxury Residential',
    'Commercial & Investment',
    'Asia-Pacific Residency',
    'European Heritage Properties'
  ];
  const regionsList = [
    ['UAE', 'UK', 'MONACO'],
    ['UAE', 'SAUDI ARABIA', 'QATAR'],
    ['SINGAPORE', 'HK', 'TOKYO'],
    ['FRANCE', 'ITALY', 'SPAIN']
  ];
  const volumes = ['$340M', '$580M', '$210M', '$180M'];
  const ratings = [4.9, 5.0, 4.8, 4.9];
  const salesList = [48, 62, 35, 29];

  const agents = users.map((user, idx) => {
    const listIndex = idx % 4;
    return {
      id: user._id.toString(),
      name: user.name,
      title: user.bio || specialties[listIndex],
      regions: regionsList[listIndex],
      rating: ratings[listIndex],
      volume: volumes[listIndex],
      sales: salesList[listIndex],
      initial: user.name ? user.name.charAt(0).toUpperCase() : 'A'
    };
  });

  res.status(200).json({
    status: 'success',
    results: agents.length,
    data: {
      agents
    }
  });
});
