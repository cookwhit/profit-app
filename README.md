# Weekly Revenue - Shopify App

A simple Shopify app that displays a bar chart of weekly revenue for 2025.

![Weekly Revenue Chart](docs/screenshot.png)

## Features

- 📊 Weekly revenue bar chart for 2025
- 💰 Total revenue summary
- 📦 Order count per week
- 🎨 Clean Polaris UI design

## Prerequisites

- [Node.js](https://nodejs.org/) 18.0.0 or higher
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/installation)
- A [Shopify Partner account](https://partners.shopify.com/signup)

## Quick Setup

### 1. Create a Shopify App in Partner Dashboard

1. Go to [Shopify Partners](https://partners.shopify.com)
2. Navigate to **Apps** → **Create app**
3. Choose **Create app manually**
4. Name it "Weekly Revenue" and click **Create**
5. Note your **Client ID** and **Client secret**

### 2. Clone and Configure

```bash
# Navigate to the app directory
cd weekly-revenue-app

# Install dependencies
npm install

# Copy environment example
cp .env.example .env
```

Edit `.env` with your credentials:
```
SHOPIFY_API_KEY=your_client_id_here
SHOPIFY_API_SECRET=your_client_secret_here
SCOPES=read_orders
SHOPIFY_APP_URL=https://your-ngrok-url.ngrok-free.app
```

### 3. Set Up Database

```bash
# Generate Prisma client and create database
npm run setup
```

### 4. Link to Shopify

```bash
# Link your local app to Shopify
npm run config:link
```

Select your app from the list when prompted.

### 5. Run Development Server

```bash
npm run dev
```

This will:
- Start the Remix dev server
- Create a tunnel (or use ngrok)
- Update your app URLs in Shopify

### 6. Install on Development Store

1. Open the URL shown in terminal
2. Select your development store
3. Click **Install**
4. View your weekly revenue chart!

## Deploying to Production

### Using Fly.io (Recommended)

```bash
# Install Fly CLI
brew install flyctl

# Login and launch
fly auth login
fly launch

# Set secrets
fly secrets set SHOPIFY_API_KEY=your_key SHOPIFY_API_SECRET=your_secret

# Deploy
fly deploy
```

### Using Railway, Render, or Heroku

1. Push code to GitHub
2. Connect your repo to the platform
3. Add environment variables
4. Deploy

## App Store Submission

1. In Partner Dashboard, go to your app
2. Fill out **App listing** details
3. Upload screenshots
4. Submit for review

### Required for App Store

- [ ] Privacy policy URL
- [ ] App screenshots
- [ ] GDPR webhook handlers (included)
- [ ] Test on multiple stores

## Tech Stack

- **Framework**: [Remix](https://remix.run)
- **UI**: [Shopify Polaris](https://polaris.shopify.com)
- **Charts**: [Recharts](https://recharts.org)
- **Database**: SQLite with Prisma
- **Auth**: Shopify App Bridge

## API Scope

This app only requires:
- `read_orders` - To fetch order data for revenue calculations

## Support

Having issues? Check:
- [Shopify App Development Docs](https://shopify.dev/docs/apps)
- [Remix Documentation](https://remix.run/docs)
- [Shopify Partners Community](https://community.shopify.com/c/shopify-developers/ct-p/shopify-developers)
