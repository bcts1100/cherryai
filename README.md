# 🍒 CHERRY - Complete Health Intelligence & Life Coaching System

**AI-Powered Personal Health Coach with Self-Evolving Architecture**

CHERRY is a revolutionary offline-first Progressive Web App (PWA) that combines intelligent health tracking, nutrition analysis, goal management, and AI coaching into a single, comprehensive life management system. What makes CHERRY unique is its **self-modifying architecture** - it can add, remove, and modify its own features through natural conversation.

![CHERRY Dashboard](https://img.shields.io/badge/version-11.4-green) ![React](https://img.shields.io/badge/React-18-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen) ![License](https://img.shields.io/badge/license-MIT-orange)

---

## ✨ Key Features

### 🤖 **AI-Powered Coaching**
- Natural language conversation with Claude Sonnet 4
- Context-aware responses with 30-day pattern analysis
- Adaptive coaching based on your progress and goals
- Multi-domain life coaching (health, fitness, career, business, creative, financial)

### 🧠 **Self-Evolving System (v11.0+)**
- **Add trackers on-the-fly**: "Add mood tracking" → Component generated and deployed instantly
- **Remove unused features**: "Remove water intake" → Clean removal with data preservation
- **Create custom charts**: "Add a chart showing protein over time" → Visual analytics generated
- **Undo changes**: Built-in rollback system with automatic backups
- AI generates React components in real-time using Claude API

### 📊 **Comprehensive Health Tracking**
- Daily metrics: Sleep quality, energy levels, pain tracking, weight, steps, calories
- 30-day trend analysis with pattern detection
- Milestone celebrations and progress tracking
- Visual analytics and insights dashboard

### 🥗 **Intelligent Nutrition System**
- USDA FoodData Central API integration (300,000+ foods, 23 nutrients)
- Automatic nutrition lookup from natural language ("ate chicken breast")
- Complex meal parsing ("wrap with turkey, ham, and bell peppers")
- RDA tracking for macros, vitamins, and minerals
- Smart food filtering (whole foods prioritized over prepared meals)
- Conversational food deletion

### 🎯 **Universal Life Coaching**
- **11 Life Domains**: Health, Fitness, Career, Education, Business, Financial, Creative, Personal Development, Social, Habits
- AI-generated action plans with weekly phases
- Domain-specific guidance and strategies
- Cross-domain synergy detection
- Life balance dashboard

### 📅 **Google Calendar Integration**
- Natural language event creation ("add gym to calendar tomorrow at 6pm")
- Event deletion with smart search
- OAuth 2.0 authentication
- Automatic reminders

### 🔔 **Smart Notifications**
- Web Push notifications (VAPID)
- Scheduled reminders
- Milestone celebrations
- Goal progress alerts

### 🎨 **Beautiful Dark UI**
- Woodsy earth tone theme
- Mobile-first responsive design
- Smooth animations and transitions
- Accessibility-focused

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (Download from [nodejs.org](https://nodejs.org))
- **npm** (comes with Node.js)
- **Anthropic API Key** ([Get one here](https://console.anthropic.com))
- **USDA API Key** (Optional - [Get one here](https://fdc.nal.usda.gov/api-key-signup.html))
- **Google OAuth Credentials** (Optional for calendar - [Get them here](https://console.cloud.google.com))

### Installation

1. **Clone or Download**
   ```bash
   # Extract CHERRY-v11.4-SYNTAX-FIX.zip to a folder
   cd cherry-v11
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```
   
   This installs:
   - `express` - Web server
   - `sqlite3` - Local database
   - `@anthropic-ai/sdk` - Claude AI integration
   - `googleapis` - Google Calendar API
   - `web-push` - Push notifications
   - `axios` - HTTP client
   - `express-session` - Session management
   - `dotenv` - Environment variables
   - `cors` - Cross-origin requests

3. **Configure Environment Variables**
   
   Create a `.env` file in the project root:
   ```env
   # Required
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   PORT=3000

   # Optional (for full features)
   USDA_API_KEY=your_usda_api_key_here
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

   # Auto-generated on first run
   VAPID_PUBLIC_KEY=
   VAPID_PRIVATE_KEY=
   ```

4. **Start the Server**
   ```bash
   npm start
   ```

5. **Open in Browser**
   ```
   http://localhost:3000
   ```

---

## 📖 Usage Guide

### Basic Workflow

1. **Daily Check-in (Natural Language)**
   ```
   You: "Sleep at 7, energy at 6, knee pain at 3"
   CHERRY: ✓ Metrics logged. Energy improving vs yesterday!
   ```

2. **Log Food (Automatic Nutrition Lookup)**
   ```
   You: "Ate chicken breast and rice"
   CHERRY: ✓ Logged: Chicken breast (165 cal, 31g protein)
           ✓ Logged: White rice (205 cal, 45g carbs)
   ```

3. **Create Goals (AI-Powered Plans)**
   ```
   You: "I want to learn Python"
   CHERRY: ✓ Goal created: Learn Python
           📋 Generated 90-day learning plan with daily exercises
           🎯 Week 1: Python basics and syntax fundamentals
   ```

4. **Self-Modification (Add Features)**
   ```
   You: "Add mood tracking"
   CHERRY: ✓ Created mood tracker with emoji selector
           ✓ Added to Dashboard
           Check it out! 😊🙂😐😕😢
   ```

5. **Calendar Management**
   ```
   You: "Add gym to calendar tomorrow at 6pm"
   CHERRY: ✓ Added to Google Calendar: Gym @ 6:00 PM tomorrow
   ```

### Advanced Features

#### Self-Evolution Commands
- `"add [metric] tracking"` - Create custom trackers
- `"remove [metric]"` - Delete trackers
- `"add a chart showing [data]"` - Generate visualizations
- `"undo that"` - Rollback last change

#### Goal Creation Patterns
- `"I want to quit [habit]"` → Reduction plan
- `"Help me learn [skill]"` → Learning curriculum
- `"I want to build [project]"` → Project roadmap
- `"I need to save $[amount]"` → Financial plan
- `"I want to transition to [career]"` → Career change plan

#### Food Logging
- Simple: `"ate eggs"` → Automatic lookup
- Complex: `"had a turkey wrap with lettuce and tomato"` → Multi-ingredient parsing
- Quantity: `"2 eggs"` → Quantity-aware calculation
- Delete: `"delete the veggie burger"` → Conversational removal

---

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 18 (via UMD, no build step required)
- Babel Standalone (runtime JSX compilation)
- Chart.js (data visualization)
- Vanilla CSS with CSS variables

**Backend:**
- Node.js + Express
- SQLite3 (local database)
- Claude Sonnet 4 API
- USDA FoodData Central API
- Google Calendar API
- Web Push (VAPID)

**Self-Evolution System:**
- `ComponentManager.js` - Component lifecycle management
- `SchemaMigration.js` - Safe database schema evolution
- `ComponentGenerator.js` - AI-powered React component generation
- `ModificationDetector.js` - Natural language intent parsing

### Database Schema

```
metrics          - Daily health metrics
food_log         - Nutrition tracking
goals            - Life goals and targets
goal_plans       - AI-generated action plans
goal_progress    - Progress tracking
supplements      - Supplement database
supplement_log   - Supplement intake
conversations    - Chat history
reminders        - Scheduled notifications
push_subscriptions - Web push endpoints
calendar_sync    - Google Calendar integration
```

### Project Structure

```
cherry-v11/
├── server.js                    # Main server
├── ComponentManager.js          # Component lifecycle
├── SchemaMigration.js          # Database evolution
├── ComponentGenerator.js       # AI code generation
├── ModificationDetector.js     # Intent parsing
├── package.json                # Dependencies
├── .env                        # Configuration
├── public/
│   └── cherry.html            # Single-page app
├── /mnt/user-data/
│   ├── components/
│   │   ├── custom/           # User-generated components
│   │   ├── templates/        # Component templates
│   │   └── active.json       # Component registry
│   ├── backups/              # Automatic backups
│   └── migrations/           # Schema changes
└── cherry.db                   # SQLite database
```

---

## 🔧 Configuration

### API Keys Setup

**Anthropic API (Required)**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create account / Sign in
3. Generate API key
4. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

**USDA FoodData Central (Optional)**
1. Go to [fdc.nal.usda.gov/api-key-signup.html](https://fdc.nal.usda.gov/api-key-signup.html)
2. Sign up for free API key
3. Add to `.env`: `USDA_API_KEY=your_key`
4. Without this, basic calorie estimation is used

**Google Calendar (Optional)**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials
5. Set redirect URI: `http://localhost:3000/auth/google/callback`
6. Add to `.env`:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```
7. Connect in app: Visit `http://localhost:3000/auth/google`

---

## 🎯 Roadmap

### Current Version (v11.4)
✅ Self-evolving architecture with AI component generation  
✅ Multi-domain life coaching (11 domains)  
✅ Intelligent nutrition system with USDA API  
✅ Google Calendar integration  
✅ Web push notifications  
✅ 30-day pattern analysis  

### Planned Features
- 📊 Interactive Chart.js visualizations
- 🔄 Data export/import (JSON, CSV)
- 📱 Native mobile apps (React Native)
- 🔐 Multi-user support with authentication
- 🌐 Cloud sync (optional)
- 🏋️ Workout tracking with exercise library
- 💊 Medication reminders
- 🩺 Health metrics integrations (Apple Health, Google Fit)
- 📸 Photo progress tracking
- 🤝 Social features (accountability partners)

---

## 🐛 Troubleshooting

### Common Issues

**"Server won't start"**
- Check Node.js version: `node --version` (must be 18+)
- Check if port 3000 is in use: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows)
- Install dependencies: `npm install`

**"ANTHROPIC_API_KEY not configured"**
- Make sure `.env` file exists in project root
- Check API key format: `sk-ant-api03-...`
- Restart server after adding key

**"Component failed to load"**
- Check browser console (F12) for errors
- Try saying: "remove [component name]"
- Clear browser cache: Ctrl+Shift+Delete
- Restart server

**"Food lookup not working"**
- USDA API key may be missing or invalid
- Free tier has rate limits (1000 requests/hour)
- System falls back to basic estimation

**"Google Calendar not connecting"**
- Verify OAuth credentials in Google Console
- Check redirect URI matches exactly
- Visit `/auth/google` to reconnect

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/cherry/issues)
- **Documentation**: [Wiki](https://github.com/yourusername/cherry/wiki)

---

## 🙏 Acknowledgments

- **Claude AI** by Anthropic - Powers the intelligent coaching system
- **USDA FoodData Central** - Comprehensive nutrition database
- **React** - Frontend framework
- **Chart.js** - Data visualization library

---

## 📊 Stats

- **Languages**: JavaScript, HTML, CSS
- **Lines of Code**: ~3000+
- **API Integrations**: 3 (Anthropic, USDA, Google)
- **Database Tables**: 12
- **Supported Nutrition Data Points**: 23
- **Life Domains**: 11
- **Goal Types**: 15+

---

**Built with ❤️ for Marines and anyone serious about optimizing their life.**

**Semper Fi 🍒**
