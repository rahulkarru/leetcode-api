const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
const cors = require("cors");
app.use(cors({
  origin: ["http://localhost:5173", "https://rahulkarru.github.io/Coding_DashBoard/"],
  methods: ["GET"],
}));

app.use(express.json());
app.use(rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit each IP to 100 requests per hour
  message: 'Too many requests, please try again later.'
}));

// Helper: Load data from JSON file
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return {};
}

// Helper: Save data to JSON file
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Helper: Fetch user contest stats via GraphQL
async function fetchContestStats(username) {
  const query = `
    query {
      userContestRanking(username: "${username}") {
        rating
        attendedContestsCount
      }
    }
  `;
  try {
    const response = await axios.post('https://leetcode.com/graphql', { query }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000 // 10s timeout
    });
    return response.data.data.userContestRanking || null;
  } catch (error) {
    console.error(`Error fetching stats for ${username}:`, error.message);
    return null;
  }
}

// Helper: Fetch contest history via GraphQL
async function fetchContestHistory(username) {
  const query = `
    query {
      userContestRankingHistory(username: "${username}") {
        contest {
          title
          startTime
        }
        ranking
        rating
      }
    }
  `;
  try {
    const response = await axios.post('https://leetcode.com/graphql', { query }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return response.data.data.userContestRankingHistory || [];
  } catch (error) {
    console.error(`Error fetching history for ${username}:`, error.message);
    return [];
  }
}

// Helper: Update data for a user
async function updateUserData(username) {
  console.log(`Updating data for ${username}...`);
  const stats = await fetchContestStats(username);
  const history = await fetchContestHistory(username);
  
  if (stats || history.length > 0) {
    const data = loadData();
    data[username] = {
      lastUpdated: new Date().toISOString(),
      stats,
      history
    };
    saveData(data);
    console.log(`Data updated for ${username}`);
  } else {
    console.log(`No data found for ${username}`);
  }
}

// Routes
app.get('/stats/:username', async (req, res) => {
  const { username } = req.params;
  const data = loadData();
  if (data[username] && data[username].stats) {
    res.json({
      username,
      ...data[username].stats,
      lastUpdated: data[username].lastUpdated
    });
  } else {
    res.status(404).json({ error: 'Data not found. Try updating first.' });
  }
});

app.get('/history/:username', async (req, res) => {
  const { username } = req.params;
  const data = loadData();
  if (data[username] && data[username].history) {
    res.json({
      username,
      history: data[username].history,
      lastUpdated: data[username].lastUpdated
    });
  } else {
    res.status(404).json({ error: 'History not found. Try updating first.' });
  }
});

app.get('/update/:username', async (req, res) => {
  const { username } = req.params;
  await updateUserData(username);
  res.json({ message: `Update triggered for ${username}` });
});

// Scheduled updates: Run every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Running scheduled update...');
  const data = loadData();
  for (const username of Object.keys(data)) {
    await updateUserData(username);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Delay to avoid rate limits
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`LeetCode API running on http://localhost:${PORT}`);
  console.log('Scheduled updates every 6 hours.');
});
