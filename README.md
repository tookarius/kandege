# KANDEGE — Aviator & Binary Options Platform

A modern, responsive single-page betting platform featuring **Aviator (Crash Game)** and **Binary Options**, built with a beautiful glassmorphism UI. Currently deployed on Vercel with real M-Pesa deposits via PayHero.

## Features

- Fully animated Aviator crash game with plane, multiplier curve, and auto-cashout
- Binary Options with live candlestick chart
- Real M-Pesa deposits using **PayHero STK Push**
- Provably Fair explanation
- Live chat simulation
- Dark/Light theme toggle
- Fully responsive (mobile + desktop)
- Dashboard with stats and transaction history

## Project Structure
kandege-platform/
├── public/
│   └── index.html                 ← Main frontend (single HTML file)
├── api/
│   ├── deposit/
│   │   ├── initiate.js            ← Initiate M-Pesa STK Push
│   │   └── callback.js            ← PayHero callback
│   └── balance.js                 ← Get user balance
├── vercel.json                    ← Routing configuration
├── .env                           ← Environment variables (git ignored)
├── package.json
└── README.md
text## Tech Stack

- **Frontend**: Vanilla HTML + CSS + JavaScript (single file)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Payment**: PayHero (M-Pesa STK Push)
- **Deployment**: Vercel

## Environment Variables

Add these in your Vercel Dashboard (Settings → Environment Variables):

| Variable                  | Description                          | Required |
|--------------------------|--------------------------------------|----------|
| `PAYHERO_CHANNEL_ID`     | Your PayHero Channel ID              | Yes      |
| `PAYHERO_API_KEY`        | PayHero API Key (if required)        | Sometimes|

Create a local `.env` file for development:

```env
PAYHERO_CHANNEL_ID=your_channel_id
PAYHERO_API_KEY=your_key_if_needed
Local Development
Bash# 1. Clone the repo
git clone <your-repo-url>
cd kandege-platform

# 2. Install dependencies
npm install

# 3. Create .env file with your PayHero credentials

# 4. Run locally
npm run dev
Open http://localhost:3000
Deployment on Vercel

Push your code to GitHub
Go to vercel.com and import the repository
Add the environment variables in Vercel Dashboard
Click Deploy

Your app will be live instantly.
Current Limitations (To Be Improved)

Balance is currently in demo mode (api/balance.js)
No real user authentication or database yet
No persistent transaction history
Callback only logs successful payments (no real balance update)

Future Improvements

Add MongoDB / Supabase / Vercel Postgres for real user accounts and balances
Implement JWT authentication
Add real transaction logging
Improve provably fair with actual server seeds
Add sound effects and better animations

License
This project is for educational and demonstration purposes.
Real-money gambling requires proper licensing from the Betting Control and Licensing Board (BCLB) in Kenya.

Made with ❤️ for learning & demonstration
text---

### Next Recommended Steps

After adding these two files:

1. Update your `public/index.html` to fetch real balance on login (using `/api/balance`).
2. Add a simple authentication system (optional but recommended).
3. Connect a real database for persistent balances.

Would you like me to give you the **updated `index.html` sections** (especially how to fetch balance after login and on deposit success) so everything connects properly?

Just say **"Yes, give me the frontend updates"** and I’ll provide the exact code changes for `index.html`. 

You now have everything needed to deploy on Vercel!
