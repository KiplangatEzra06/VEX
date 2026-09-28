# Vex

Vex is a personal AI chat assistant built with Node.js, Express, and the Google Gemini API.

## Setup

1. Install dependencies:
   npm install
2. Copy the example environment file:
   copy .env.example .env
3. Add your Gemini API key from Google AI Studio to the `.env` file.
4. Start the app:
   npm start

The app will run at http://localhost:3000.

## Deploy to Render

Render can host this app as a Node web service using the same Express app. The frontend is served from the project’s `public/` folder, so there is no separate static host required.
