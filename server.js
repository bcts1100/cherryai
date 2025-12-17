const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const session = require('express-session');
const webpush = require('web-push');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// v11.0 Self-Evolution Modules
const ComponentManager = require('./ComponentManager');
const SchemaMigration = require('./SchemaMigration');
const { generateComponent, getTemplate } = require('./ComponentGenerator');
const { 
    detectModificationRequest, 
    metricToFieldName, 
    metricToComponentName,
    inferDataType 
} = require('./ModificationDetector');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'cherry-health-assistant-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Initialize Claude API
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Google OAuth
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Setup Web Push
let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.log('Generating VAPID keys for push notifications...');
    vapidKeys = webpush.generateVAPIDKeys();
    
    // Update .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/VAPID_PUBLIC_KEY=.*/, `VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
    envContent = envContent.replace(/VAPID_PRIVATE_KEY=.*/, `VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
    fs.writeFileSync(envPath, envContent);
    
    console.log('✓ VAPID keys generated and saved to .env');
}

webpush.setVapidDetails(
    'mailto:timothy@cherryhealth.ai',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Database setup
const db = new sqlite3.Database('./cherry.db', (err) => {
    if (err) {
        console.error('❌ Database error:', err);
    } else {
        console.log('✓ Connected to SQLite database');
        initDatabase();
    }
});

// Initialize v11.0 Self-Evolution System
const componentManager = new ComponentManager();
const schemaMigration = new SchemaMigration(db);

console.log('✓ Self-evolution system initialized');

function initDatabase() {
    // Previous tables...
    db.run(`CREATE TABLE IF NOT EXISTS supplements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT,
        category TEXT,
        timing TEXT,
        caffeine_content INTEGER DEFAULT 0,
        ingredients TEXT,
        source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        sleep INTEGER,
        energy INTEGER,
        knee_pain INTEGER,
        seltzers INTEGER,
        water_oz INTEGER,
        workout_done BOOLEAN,
        weight REAL,
        steps INTEGER,
        calories_consumed INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS supplement_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplement_name TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        date TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS food_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        food_name TEXT NOT NULL,
        serving_size TEXT,
        calories REAL,
        protein REAL,
        carbs REAL,
        fat REAL,
        fiber REAL,
        sugar REAL,
        sodium REAL,
        cholesterol REAL,
        saturated_fat REAL,
        vitamin_a REAL,
        vitamin_c REAL,
        vitamin_d REAL,
        vitamin_e REAL,
        vitamin_k REAL,
        vitamin_b6 REAL,
        vitamin_b12 REAL,
        folate REAL,
        calcium REAL,
        iron REAL,
        magnesium REAL,
        potassium REAL,
        zinc REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        date TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_message TEXT NOT NULL,
        assistant_message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Google Calendar integration
    db.run(`CREATE TABLE IF NOT EXISTS calendar_sync (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_event_id TEXT UNIQUE,
        local_event_id INTEGER,
        last_synced DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Push notification subscriptions
    db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE NOT NULL,
        keys TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Scheduled reminders
    db.run(`CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        time TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Goals system - NEW
    db.run(`CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        target_value REAL,
        current_value REAL DEFAULT 0,
        start_date TEXT NOT NULL,
        target_date TEXT,
        icon TEXT DEFAULT '🎯',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Goal plans (workout/meal/habit plans)
    db.run(`CREATE TABLE IF NOT EXISTS goal_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        plan_type TEXT NOT NULL,
        plan_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);

    // Goal progress tracking
    db.run(`CREATE TABLE IF NOT EXISTS goal_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        value REAL,
        notes TEXT,
        completed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);

    // Pre-load supplements
    const defaultSupplements = [
        {
            name: 'Alpha Brain',
            brand: 'Onnit',
            category: 'Nootropic',
            timing: 'Morning/Pre-workout',
            caffeineContent: 0,
            ingredients: JSON.stringify([
                { name: 'Vitamin B6', amount: '10mg' },
                { name: 'L-Tyrosine', amount: '300mg' },
                { name: 'L-Theanine', amount: '200mg' }
            ]),
            source: 'Pre-loaded'
        },
        {
            name: 'Mountain Ops Ignite',
            brand: 'Mountain Ops',
            category: 'Pre-Workout',
            timing: 'Pre-workout/Morning',
            caffeineContent: 350,
            ingredients: JSON.stringify([
                { name: 'Caffeine', amount: '350mg' },
                { name: 'Beta Alanine', amount: '3200mg' },
                { name: 'L-Citrulline', amount: '6000mg' }
            ]),
            source: 'Pre-loaded'
        },
        {
            name: 'Coffee',
            brand: 'Generic',
            category: 'Beverage',
            timing: 'Anytime',
            caffeineContent: 95,
            ingredients: JSON.stringify([{ name: 'Caffeine', amount: '95mg' }]),
            source: 'Pre-loaded'
        }
    ];

    db.get('SELECT COUNT(*) as count FROM supplements', (err, row) => {
        if (!err && row.count === 0) {
            const stmt = db.prepare(`INSERT INTO supplements (name, brand, category, timing, caffeine_content, ingredients, source) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            defaultSupplements.forEach(s => {
                stmt.run([s.name, s.brand, s.category, s.timing, s.caffeineContent, s.ingredients, s.source]);
            });
            stmt.finalize();
        }
    });

    // Set up default reminders
    db.get('SELECT COUNT(*) as count FROM reminders', (err, row) => {
        if (!err && row.count === 0) {
            const defaultReminders = [
                { type: 'morning_checkin', time: '10:00', message: 'Morning Timothy. Time for your daily check-in.' },
                { type: 'mountain_ops', time: '10:00', message: 'Take Mountain Ops Ignite (350mg caffeine)' },
                { type: 'lunch', time: '13:00', message: 'Lunch time. Hit that calorie target - 2200/day.' },
                { type: 'evening_checkin', time: '23:00', message: 'Evening check-in. How was today?' }
            ];
            
            const stmt = db.prepare('INSERT INTO reminders (type, time, message) VALUES (?, ?, ?)');
            defaultReminders.forEach(r => {
                stmt.run([r.type, r.time, r.message]);
            });
            stmt.finalize();
        }
    });

    console.log('✓ Database initialized');
}

// ============ GOOGLE CALENDAR FUNCTIONS ============

app.get('/auth/google', (req, res) => {
    const scopes = ['https://www.googleapis.com/auth/calendar'];
    
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
    });
    
    res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Save tokens to session
        req.session.googleTokens = tokens;
        
        res.redirect('/cherry.html?calendar=connected');
    } catch (error) {
        console.error('OAuth error:', error);
        res.redirect('/cherry.html?calendar=error');
    }
});

async function createGoogleCalendarEvent(title, dateTime, duration = 60, description = '') {
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
        throw new Error('Not authenticated with Google Calendar');
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const startTime = new Date(dateTime);
    const endTime = new Date(startTime.getTime() + duration * 60000);
    
    const event = {
        summary: title,
        description: description,
        start: {
            dateTime: startTime.toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        end: {
            dateTime: endTime.toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'popup', minutes: 15 },
            ],
        },
    };
    
    console.log(`📅 Creating calendar event: "${title}" at ${startTime.toLocaleString()}`);
    
    const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
    });
    
    console.log(`✓ Event created: ${response.data.htmlLink}`);
    
    return response.data;
}

async function deleteGoogleCalendarEvent(searchTerm, req) {
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
        throw new Error('Not authenticated with Google Calendar');
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Search for events matching the term
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30); // Search next 30 days
    
    // Capitalize search term to match how we create events
    const capitalizedSearch = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();
    
    console.log(`🔍 Searching for calendar events matching: "${capitalizedSearch}" (original: "${searchTerm}")`);
    
    const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: futureDate.toISOString(),
        q: capitalizedSearch,
        singleEvents: true,
        orderBy: 'startTime',
    });
    
    const events = response.data.items;
    
    if (!events || events.length === 0) {
        console.log(`❌ No events found matching: "${capitalizedSearch}"`);
        
        // Try searching with original term too
        console.log(`🔍 Trying with original term: "${searchTerm}"`);
        const response2 = await calendar.events.list({
            calendarId: 'primary',
            timeMin: now.toISOString(),
            timeMax: futureDate.toISOString(),
            q: searchTerm,
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        if (!response2.data.items || response2.data.items.length === 0) {
            return { deleted: 0, message: `No events found matching "${searchTerm}"` };
        }
        
        // Use the fallback results
        events = response2.data.items;
    }
    
    // Delete the first matching event
    const eventToDelete = events[0];
    
    console.log(`🗑️ Deleting event: "${eventToDelete.summary}" at ${new Date(eventToDelete.start.dateTime).toLocaleString()}`);
    
    await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventToDelete.id,
    });
    
    console.log(`✓ Event deleted successfully`);
    
    return { 
        deleted: 1, 
        message: `Deleted "${eventToDelete.summary}"`,
        eventTitle: eventToDelete.summary,
        eventTime: eventToDelete.start.dateTime
    };
}

// ============ NUTRITION LOOKUP FUNCTIONS ============

async function lookupNutrition(foodName) {
    const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
    const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
    
    try {
        // Strip leading numbers (e.g., "2 eggs" → "eggs")
        let cleanedFoodName = foodName.replace(/^\d+\s+/, '');
        if (cleanedFoodName.length < 3) cleanedFoodName = foodName; // Keep original if too short
        
        console.log(`🔍 Looking up nutrition for: "${foodName}"${cleanedFoodName !== foodName ? ` (searching: "${cleanedFoodName}")` : ''}`);
        
        const response = await axios.get(USDA_API_URL, {
            params: {
                api_key: USDA_API_KEY,
                query: cleanedFoodName,  // Use cleaned version
                pageSize: 5  // Get top 5 results for filtering
            }
        });
        
        if (!response.data.foods || response.data.foods.length === 0) {
            console.log(`⚠️ No nutrition data found for: ${foodName}`);
            
            // Try with just the last 2-3 words (often the actual food)
            const words = cleanedFoodName.split(' ');
            if (words.length > 2) {
                const simplified = words.slice(-2).join(' ');
                console.log(`🔄 Retrying with simplified term: "${simplified}"`);
                return await lookupNutrition(simplified);
            }
            
            return null;
        }
        
        // SMART FILTERING: Prefer whole foods over prepared/recipe items
        let food = response.data.foods[0]; // Default to first result
        let bestScore = 0;
        
        console.log(`🔍 Filtering ${response.data.foods.length} results for best match...`);
        
        for (const item of response.data.foods) {
            const desc = item.description.toLowerCase();
            let score = 100; // Start with base score
            
            // PENALTY for recipe/prepared indicators (strong indicators it's NOT a whole food)
            if (desc.includes('prepared with')) score -= 50;
            if (desc.includes('recipe')) score -= 40;
            if (desc.includes('dry mix')) score -= 40;
            if (desc.includes('frozen meal')) score -= 40;
            if (desc.includes('custard')) score -= 35;
            if (desc.includes('casserole')) score -= 35;
            if (desc.includes('pudding')) score -= 35;
            if (desc.includes('homemade')) score -= 30;
            if (desc.includes('restaurant')) score -= 30;
            if (desc.includes('fast food')) score -= 30;
            
            // BONUS for whole food indicators
            if (desc.includes('raw')) score += 20;
            if (desc.includes('fresh')) score += 15;
            if (desc.includes('whole')) score += 15;
            if (desc.includes('cooked')) score += 10; // Simple cooking is OK
            if (desc.includes('boiled')) score += 10;
            if (desc.includes('fried')) score += 10;
            if (desc.includes('scrambled')) score += 10;
            if (desc.includes('poached')) score += 10;
            
            // BONUS for matching the exact search term closely
            const searchWords = cleanedFoodName.toLowerCase().split(' ');
            searchWords.forEach(word => {
                if (word.length > 2 && desc.includes(word)) {
                    score += 5;
                }
            });
            
            console.log(`   → "${item.description}" (score: ${score})`);
            
            if (score > bestScore) {
                bestScore = score;
                food = item;
            }
        }
        
        console.log(`✓ Selected: "${food.description}" (score: ${bestScore})`);
        
        const nutrients = {};
        
        // Map USDA nutrient IDs to our database fields
        const nutrientMap = {
            '1008': 'calories',      // Energy (kcal)
            '1003': 'protein',       // Protein (g)
            '1005': 'carbs',         // Carbohydrate (g)
            '1004': 'fat',           // Total fat (g)
            '1079': 'fiber',         // Fiber (g)
            '2000': 'sugar',         // Sugars (g)
            '1093': 'sodium',        // Sodium (mg)
            '1253': 'cholesterol',   // Cholesterol (mg)
            '1258': 'saturated_fat', // Saturated fat (g)
            '1106': 'vitamin_a',     // Vitamin A (mcg)
            '1162': 'vitamin_c',     // Vitamin C (mg)
            '1114': 'vitamin_d',     // Vitamin D (mcg)
            '1109': 'vitamin_e',     // Vitamin E (mg)
            '1183': 'vitamin_k',     // Vitamin K (mcg)
            '1175': 'vitamin_b6',    // Vitamin B6 (mg)
            '1178': 'vitamin_b12',   // Vitamin B12 (mcg)
            '1177': 'folate',        // Folate (mcg)
            '1087': 'calcium',       // Calcium (mg)
            '1089': 'iron',          // Iron (mg)
            '1090': 'magnesium',     // Magnesium (mg)
            '1092': 'potassium',     // Potassium (mg)
            '1095': 'zinc'           // Zinc (mg)
        };
        
        // Extract nutrients
        if (food.foodNutrients) {
            food.foodNutrients.forEach(nutrient => {
                const nutrientId = nutrient.nutrientId?.toString();
                const field = nutrientMap[nutrientId];
                if (field && nutrient.value !== undefined) {
                    nutrients[field] = parseFloat(nutrient.value) || 0;
                }
            });
        }
        
        const result = {
            food_name: food.description || foodName,
            serving_size: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit || 'g'}` : '100g',
            ...nutrients
        };
        
        console.log(`✓ Found nutrition for "${result.food_name}": ${nutrients.calories || 0} cal, ${nutrients.protein || 0}g protein`);
        
        return result;
        
    } catch (error) {
        console.error(`❌ USDA API error for "${foodName}":`, error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, error.response.data);
        }
        
        // If it's a 500 error or too complex, try with simplified search
        const words = foodName.split(' ');
        if (words.length > 2) {
            const simplified = words.slice(-2).join(' ');  // Last 2 words
            console.log(`🔄 Retrying with last 2 words: "${simplified}"`);
            
            try {
                const response = await axios.get(USDA_API_URL, {
                    params: {
                        api_key: USDA_API_KEY,
                        query: simplified,
                        pageSize: 5  // Removed dataType
                    }
                });
                
                if (response.data.foods && response.data.foods.length > 0) {
                    const food = response.data.foods[0];
                    const nutrients = {};
                    
                    const nutrientMap = {
                        '1008': 'calories', '1003': 'protein', '1005': 'carbs', '1004': 'fat',
                        '1079': 'fiber', '2000': 'sugar', '1093': 'sodium', '1253': 'cholesterol',
                        '1258': 'saturated_fat', '1106': 'vitamin_a', '1162': 'vitamin_c',
                        '1114': 'vitamin_d', '1109': 'vitamin_e', '1183': 'vitamin_k',
                        '1175': 'vitamin_b6', '1178': 'vitamin_b12', '1177': 'folate',
                        '1087': 'calcium', '1089': 'iron', '1090': 'magnesium',
                        '1092': 'potassium', '1095': 'zinc'
                    };
                    
                    if (food.foodNutrients) {
                        food.foodNutrients.forEach(nutrient => {
                            const nutrientId = nutrient.nutrientId?.toString();
                            const field = nutrientMap[nutrientId];
                            if (field && nutrient.value !== undefined) {
                                nutrients[field] = parseFloat(nutrient.value) || 0;
                            }
                        });
                    }
                    
                    console.log(`✓ Retry successful: ${nutrients.calories || 0} cal`);
                    
                    return {
                        food_name: food.description || foodName,
                        serving_size: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit || 'g'}` : '100g',
                        ...nutrients
                    };
                }
            } catch (retryError) {
                console.log(`⚠️ Retry also failed`);
            }
        }
        
        return null;
    }
}

async function parseComplexMeal(mealDescription) {
    console.log(`🍽️ Parsing complex meal: "${mealDescription}"`);
    
    // Extract individual ingredients
    // Patterns: "wrap with turkey, ham, bell peppers", "chicken and rice", etc.
    const ingredients = [];
    
    // Split on common separators
    const parts = mealDescription
        .toLowerCase()
        .replace(/\s+(with|and|plus|\+)\s+/g, ',')
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    
    // Clean up each ingredient
    parts.forEach(part => {
        // Remove articles and common words
        const cleaned = part
            .replace(/^(a|an|the|some)\s+/i, '')
            .replace(/\s+(wrap|sandwich|salad|bowl)$/i, '')
            .trim();
        
        if (cleaned.length > 2) {
            ingredients.push(cleaned);
        }
    });
    
    console.log(`📋 Extracted ${ingredients.length} ingredients:`, ingredients);
    
    // Look up nutrition for each ingredient
    const nutritionData = [];
    for (const ingredient of ingredients) {
        const data = await lookupNutrition(ingredient);
        if (data) {
            nutritionData.push(data);
        }
    }
    
    if (nutritionData.length === 0) {
        console.log('⚠️ No nutrition data found for any ingredients');
        return null;
    }
    
    // Combine all nutrition data
    const combined = {
        food_name: mealDescription,
        serving_size: 'combined',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        cholesterol: 0,
        saturated_fat: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        vitamin_d: 0,
        vitamin_e: 0,
        vitamin_k: 0,
        vitamin_b6: 0,
        vitamin_b12: 0,
        folate: 0,
        calcium: 0,
        iron: 0,
        magnesium: 0,
        potassium: 0,
        zinc: 0
    };
    
    // Sum up all nutrients
    nutritionData.forEach(data => {
        Object.keys(combined).forEach(key => {
            if (key !== 'food_name' && key !== 'serving_size' && data[key] !== undefined) {
                combined[key] += parseFloat(data[key]) || 0;
            }
        });
    });
    
    console.log(`✓ Combined nutrition: ${combined.calories.toFixed(0)} cal, ${combined.protein.toFixed(1)}g protein`);
    
    return combined;
}

// ============ UNIVERSAL GOAL SYSTEM - v10.0 ============

function detectGoalDomain(subject) {
    const lower = subject.toLowerCase();
    
    // Health & Fitness keywords
    if (/workout|exercise|gym|fitness|weight|muscle|cardio|strength|run|lift|yoga/.test(lower)) {
        return 'fitness';
    }
    if (/sleep|energy|pain|knee|health|diet|nutrition|calorie|supplement/.test(lower)) {
        return 'health';
    }
    if (/drink|smoke|seltzer|alcohol|junk food|sugar/.test(lower)) {
        return 'habit';
    }
    
    // Career & Education keywords
    if (/job|career|position|work|employment|resume|interview|promotion/.test(lower)) {
        return 'career';
    }
    if (/learn|study|course|skill|education|training|certification|degree|bootcamp/.test(lower)) {
        return 'education';
    }
    if (/code|coding|program|python|javascript|web dev|software|tech/.test(lower)) {
        return 'education';
    }
    
    // Business & Entrepreneurship keywords
    if (/business|company|startup|venture|enterprise|launch|brand/.test(lower)) {
        return 'business';
    }
    if (/sell|sales|revenue|profit|customer|client|market/.test(lower)) {
        return 'business';
    }
    if (/coffee|product|service|store|shop/.test(lower)) {
        return 'business';
    }
    
    // Financial keywords
    if (/save|saving|money|dollar|\$|budget|debt|invest|financial/.test(lower)) {
        return 'financial';
    }
    
    // Creative & Personal Development keywords
    if (/write|book|blog|article|novel|story|content/.test(lower)) {
        return 'creative';
    }
    if (/game|develop|app|software|project|build/.test(lower)) {
        return 'creative';
    }
    if (/read|books|reading|knowledge/.test(lower)) {
        return 'personal_dev';
    }
    if (/meditate|mindfulness|journal|habit|routine/.test(lower)) {
        return 'personal_dev';
    }
    
    // Social & Relationships keywords
    if (/friend|social|network|relationship|connect|community/.test(lower)) {
        return 'social';
    }
    
    // Default to general
    return 'general';
}

function getDomainIcon(domain) {
    const icons = {
        'health': '🏥',
        'fitness': '💪',
        'habit': '🎯',
        'career': '💼',
        'education': '📚',
        'business': '💰',
        'financial': '💵',
        'creative': '🎨',
        'personal_dev': '🌱',
        'social': '🤝',
        'general': '⭐'
    };
    return icons[domain] || '🎯';
}

// ============ INTELLIGENT COACHING SYSTEM - PHASE 3 ============

async function analyzeUserPatterns(userId = 1) {
    // Analyze last 30 days of data to find patterns
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    
    return new Promise((resolve) => {
        const patterns = {
            sleep_avg: 0,
            energy_avg: 0,
            knee_pain_avg: 0,
            calories_avg: 0,
            best_day: null,
            worst_day: null,
            consistency_score: 0,
            trends: [],
            insights: []
        };
        
        // Get metrics history
        db.all(
            'SELECT * FROM metrics WHERE date >= ? ORDER BY date ASC',
            [startDate],
            (err, metrics) => {
                if (err || !metrics || metrics.length === 0) {
                    return resolve(patterns);
                }
                
                // Calculate averages
                let sleepSum = 0, energySum = 0, kneeSum = 0, calSum = 0, count = 0;
                let bestScore = 0, worstScore = 100;
                
                metrics.forEach(m => {
                    if (m.sleep) { sleepSum += m.sleep; count++; }
                    if (m.energy) energySum += m.energy;
                    if (m.knee_pain) kneeSum += m.knee_pain;
                    if (m.calories_consumed) calSum += m.calories_consumed;
                    
                    // Overall day score (higher is better)
                    const dayScore = ((m.sleep || 0) + (m.energy || 0) - (m.knee_pain || 0)) / 3;
                    if (dayScore > bestScore) {
                        bestScore = dayScore;
                        patterns.best_day = m.date;
                    }
                    if (dayScore < worstScore && m.sleep) {
                        worstScore = dayScore;
                        patterns.worst_day = m.date;
                    }
                });
                
                if (count > 0) {
                    patterns.sleep_avg = (sleepSum / count).toFixed(1);
                    patterns.energy_avg = (energySum / count).toFixed(1);
                    patterns.knee_pain_avg = (kneeSum / count).toFixed(1);
                    patterns.calories_avg = Math.round(calSum / count);
                    patterns.consistency_score = Math.round((count / 30) * 100);
                }
                
                // Detect trends
                if (metrics.length >= 7) {
                    const recent = metrics.slice(-7);
                    const older = metrics.slice(-14, -7);
                    
                    const recentSleep = recent.reduce((s, m) => s + (m.sleep || 0), 0) / 7;
                    const olderSleep = older.reduce((s, m) => s + (m.sleep || 0), 0) / 7;
                    
                    if (recentSleep > olderSleep + 0.5) {
                        patterns.trends.push('sleep_improving');
                        patterns.insights.push('Sleep quality improving over last week');
                    } else if (recentSleep < olderSleep - 0.5) {
                        patterns.trends.push('sleep_declining');
                        patterns.insights.push('Sleep quality declining - check evening routine');
                    }
                    
                    const recentCals = recent.reduce((s, m) => s + (m.calories_consumed || 0), 0) / 7;
                    if (recentCals < 1500) {
                        patterns.insights.push('Severe calorie deficit - energy and recovery impacted');
                    }
                }
                
                // Check goal progress
                db.all('SELECT * FROM goals WHERE status = "active"', (err, goals) => {
                    if (!err && goals) {
                        goals.forEach(goal => {
                            const progressPercent = goal.target_value > 0 
                                ? (goal.current_value / goal.target_value) * 100
                                : 0;
                            
                            if (progressPercent < 20) {
                                patterns.insights.push(`Goal "${goal.title}" needs attention - low progress`);
                            } else if (progressPercent > 80) {
                                patterns.insights.push(`Goal "${goal.title}" almost complete - final push!`);
                            }
                        });
                    }
                    
                    resolve(patterns);
                });
            }
        );
    });
}

async function generateAdaptiveCoachingMessage(patterns, context) {
    // Generate personalized coaching based on patterns
    const coachingPrompt = `Based on Timothy's 30-day patterns, generate a brief, direct coaching message (2-3 sentences max).

PATTERNS:
- Sleep avg: ${patterns.sleep_avg}/10
- Energy avg: ${patterns.energy_avg}/10  
- Knee pain avg: ${patterns.knee_pain_avg}/10
- Calories avg: ${patterns.calories_avg}/day
- Consistency: ${patterns.consistency_score}%
- Trends: ${patterns.trends.join(', ')}
- Insights: ${patterns.insights.join('; ')}

TODAY'S CONTEXT:
- Sleep: ${context.metrics?.sleep || 'not logged'}/10
- Energy: ${context.metrics?.energy || 'not logged'}/10
- Calories: ${context.food.reduce((s, f) => s + (f.calories || 0), 0)} so far

Create motivational, actionable coaching in Marine Corps style. Address specific concerns.`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            messages: [{ role: 'user', content: coachingPrompt }]
        });
        
        return response.content[0].text;
    } catch (error) {
        return null;
    }
}

async function checkMilestones(goalId) {
    // Check if goal hit any milestones
    return new Promise((resolve) => {
        db.get('SELECT * FROM goals WHERE id = ?', [goalId], (err, goal) => {
            if (err || !goal) return resolve(null);
            
            const milestones = [];
            const progress = goal.target_value > 0 
                ? (goal.current_value / goal.target_value) * 100 
                : 0;
            
            // Check milestone thresholds
            if (progress >= 25 && progress < 26) {
                milestones.push({ type: '25%', message: '25% complete - solid start, Marine!' });
            }
            if (progress >= 50 && progress < 51) {
                milestones.push({ type: '50%', message: 'Halfway there! Keep pushing!' });
            }
            if (progress >= 75 && progress < 76) {
                milestones.push({ type: '75%', message: '75% complete - final stretch!' });
            }
            if (progress >= 100) {
                milestones.push({ type: '100%', message: `🎉 GOAL COMPLETE: ${goal.title}! Outstanding work!` });
                
                // Auto-complete the goal
                db.run('UPDATE goals SET status = ? WHERE id = ?', ['completed', goalId]);
            }
            
            // Check for streaks
            db.all(
                `SELECT * FROM goal_progress 
                 WHERE goal_id = ? AND completed = 1 
                 ORDER BY date DESC LIMIT 7`,
                [goalId],
                (err, progress) => {
                    if (!err && progress && progress.length >= 7) {
                        milestones.push({ 
                            type: 'streak', 
                            message: '🔥 7-day streak! You\'re unstoppable!' 
                        });
                    }
                    
                    resolve(milestones);
                }
            );
        });
    });
}

// ============ EXISTING AI PLAN GENERATION CONTINUES ============

async function generateGoalPlan(goalType, subject, domain, userContext) {
    const domainGuidance = {
        'career': `Career transition requires: skills assessment, learning roadmap, portfolio building, networking strategy, job search plan. Consider Timothy's work schedule (2pm-11:30pm) for study time.`,
        
        'education': `Learning plan needs: structured curriculum, daily practice schedule, project milestones, resource recommendations, skill checkpoints. Timothy learns best with hands-on projects.`,
        
        'business': `Business growth requires: market analysis, customer acquisition strategy, revenue targets, marketing plan, operational milestones. Timothy runs Midnight Bloom Coffee and has business background.`,
        
        'financial': `Financial goal needs: specific savings targets, budget breakdown, income/expense tracking, milestone dates, automated savings strategy.`,
        
        'creative': `Creative project needs: scope definition, production schedule, skill development, milestone deliverables, review/iteration cycles. Timothy has game dev experience (Unity/C#).`,
        
        'fitness': `Fitness plan needs: progression from current level, knee-safe exercises (Osgood-Schlatter's), recovery days, form tips, intensity scaling. Consider low energy and knee limitations.`,
        
        'health': `Health improvement needs: baseline measurement, incremental changes, symptom tracking, environmental factors, sleep/nutrition integration. Address chronic fatigue.`,
        
        'habit': `Habit change needs: gradual reduction/building, trigger identification, replacement behaviors, craving management, relapse prevention.`,
        
        'personal_dev': `Personal development needs: clear metrics, daily practices, reflection points, knowledge application, community/accountability.`,
        
        'social': `Social goal needs: specific targets (events/connections), comfort zone expansion, consistent engagement, quality over quantity focus.`,
        
        'general': `General goal needs: clear definition, measurable milestones, actionable steps, timeline, success criteria.`
    };

    const planPrompt = `You are CHERRY, creating a comprehensive life plan for Timothy.

TIMOTHY'S FULL CONTEXT:
- 37, Marine Corps vet (discipline, structure, mission-driven)
- Boeing factory worker (2pm-11:30pm shifts Mon-Fri)
- Business background + entrepreneurship experience
- Runs Midnight Bloom Coffee (coffee business)
- Game development hobby (Unity, C#, 2D pixel art)
- Chronic fatigue, knee issues (Osgood-Schlatter's from military)
- Going through divorce (high stress, limited bandwidth)
- Current health: ~1000 cal/day (target 2200), inconsistent sleep

AVAILABLE TIME:
- Mornings: 10am-1pm (best energy, before work)
- Weekends: More flexible
- Evenings after shift: Limited (tired from 9+ hour factory work)

GOAL DETAILS:
- Type: ${goalType}
- Subject: ${subject}
- Domain: ${domain}
- Domain Guidance: ${domainGuidance[domain] || domainGuidance['general']}

Create a realistic, achievable plan that:
1. Respects his work schedule and energy levels
2. Builds on his existing skills (business, coding, discipline)
3. Accounts for his constraints (fatigue, knee, stress)
4. Includes specific, actionable steps
5. Has clear weekly milestones
6. Adapts to his Marine mindset (mission-focused, structured)

Return ONLY valid JSON in this format:
{
  "title": "Specific plan title",
  "duration_days": 30-180,
  "approach": "gradual/progressive/intensive/consistent",
  "domain": "${domain}",
  "phases": [
    {
      "week": 1,
      "title": "Phase name",
      "target": "Specific measurable target",
      "daily_actions": ["Specific action 1", "Specific action 2"],
      "weekly_milestone": "What to achieve this week",
      "tips": ["Practical tip 1", "Practical tip 2"],
      "time_required": "X hours/day or Y hours/week"
    }
  ],
  "daily_tracking": {
    "metric": "What to track daily",
    "unit": "appropriate unit",
    "target_progression": "How target changes over time"
  },
  "resources": [
    {
      "type": "tool/course/book/platform",
      "name": "Resource name",
      "purpose": "Why this resource"
    }
  ],
  "reminders": [
    {
      "time": "HH:MM (24hr format)",
      "message": "Reminder text",
      "frequency": "daily/weekly/custom"
    }
  ],
  "success_criteria": "Clear definition of completion",
  "adaptations": "How to adjust if struggling or excelling",
  "motivation": "Personal why - connect to Timothy's situation"
}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 3000,  // Increased for detailed multi-domain plans
            messages: [
                { role: 'user', content: planPrompt }
            ]
        });

        const planText = response.content[0].text;
        
        // Extract JSON from response
        let jsonMatch = planText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('❌ Could not extract JSON from plan generation');
            return null;
        }
        
        const plan = JSON.parse(jsonMatch[0]);
        console.log(`✓ Generated ${domain} plan: "${plan.title}" (${plan.duration_days} days)`);
        
        return plan;
        
    } catch (error) {
        console.error('❌ Plan generation error:', error.message);
        return null;
    }
}

async function createGoalWithPlan(goalData, req) {
    const date = new Date().toISOString().split('T')[0];
    
    // Determine goal details from detected data
    let title, description, targetValue, targetDate, icon, goalType;
    
    const subject = goalData.subject;
    const domain = goalData.domain || 'general';
    
    // Get domain-specific icon
    icon = getDomainIcon(domain);
    
    // Determine goal type and details based on action type
    switch (goalData.type) {
        case 'quit':
        case 'stop':
            title = `Quit ${subject}`;
            description = `Gradually reduce and eliminate ${subject}`;
            targetValue = 0;
            goalType = 'habit_reduction';
            
            const quitDate = new Date();
            quitDate.setDate(quitDate.getDate() + 30);
            targetDate = quitDate.toISOString().split('T')[0];
            break;
            
        case 'start':
        case 'begin':
            title = `Start ${subject}`;
            description = `Begin and build consistency with ${subject}`;
            targetValue = 100;
            goalType = 'habit_building';
            
            const startDate = new Date();
            startDate.setDate(startDate.getDate() + (domain === 'education' || domain === 'career' ? 90 : 30));
            targetDate = startDate.toISOString().split('T')[0];
            break;
            
        case 'learn':
            title = `Learn ${subject}`;
            description = `Develop proficiency in ${subject}`;
            targetValue = 100;
            goalType = 'learning';
            
            const learnDate = new Date();
            learnDate.setDate(learnDate.getDate() + 90);  // 90 days for learning goals
            targetDate = learnDate.toISOString().split('T')[0];
            break;
            
        case 'build':
        case 'create':
        case 'launch':
            title = `${goalData.type.charAt(0).toUpperCase() + goalData.type.slice(1)} ${subject}`;
            description = `Complete and launch ${subject}`;
            targetValue = 100;
            goalType = 'project';
            
            const buildDate = new Date();
            buildDate.setDate(buildDate.getDate() + 90);
            targetDate = buildDate.toISOString().split('T')[0];
            break;
            
        case 'grow':
            title = `Grow ${subject}`;
            description = `Scale and expand ${subject}`;
            targetValue = 100;
            goalType = 'business_growth';
            
            const growDate = new Date();
            growDate.setDate(growDate.getDate() + 90);
            targetDate = growDate.toISOString().split('T')[0];
            break;
            
        case 'career':
        case 'transition':
            title = `${subject} Career Transition`;
            description = `Successfully transition to ${subject}`;
            targetValue = 100;
            goalType = 'career_change';
            
            const careerDate = new Date();
            careerDate.setDate(careerDate.getDate() + 180);  // 6 months for career goals
            targetDate = careerDate.toISOString().split('T')[0];
            break;
            
        case 'save':
            title = `Save ${subject}`;
            description = `Reach savings target: ${subject}`;
            
            // Extract number if present
            const moneyMatch = subject.match(/\$?(\d+(?:,\d+)?(?:\.\d+)?)/);
            targetValue = moneyMatch ? parseFloat(moneyMatch[1].replace(',', '')) : 10000;
            goalType = 'financial';
            
            const saveDate = new Date();
            saveDate.setDate(saveDate.getDate() + 365);  // 1 year for financial goals
            targetDate = saveDate.toISOString().split('T')[0];
            break;
            
        case 'target':
        case 'hit':
        case 'reach':
            title = `Hit ${subject}`;
            description = `Reach and maintain ${subject}`;
            
            const numMatch = subject.match(/(\d+)/);
            targetValue = numMatch ? parseInt(numMatch[1]) : 100;
            goalType = 'target_tracking';
            
            const targetEnd = new Date();
            targetEnd.setDate(targetEnd.getDate() + 30);
            targetDate = targetEnd.toISOString().split('T')[0];
            break;
            
        case 'improve':
            title = `Improve ${subject}`;
            description = `Incrementally improve ${subject}`;
            targetValue = 100;
            goalType = 'improvement';
            
            const improveDate = new Date();
            improveDate.setDate(improveDate.getDate() + 30);
            targetDate = improveDate.toISOString().split('T')[0];
            break;
            
        case 'finish':
        case 'complete':
            title = `Complete ${subject}`;
            description = `Finish ${subject}`;
            targetValue = 100;
            goalType = 'completion';
            
            const finishDate = new Date();
            finishDate.setDate(finishDate.getDate() + 60);
            targetDate = finishDate.toISOString().split('T')[0];
            break;
            
        default:
            title = `${subject}`;
            description = `Achieve goal: ${subject}`;
            targetValue = 100;
            goalType = 'general';
            
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 30);
            targetDate = defaultDate.toISOString().split('T')[0];
    }
    
    // Generate AI plan with domain context
    console.log(`🤖 Generating ${domain} plan for: ${title}...`);
    const plan = await generateGoalPlan(goalData.type, goalData.subject, domain, {});
    
    if (!plan) {
        console.log('⚠️ Plan generation failed, creating goal without plan');
    }
    
    // Create goal in database
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO goals (type, title, description, target_value, start_date, target_date, icon) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [goalType, title, description, targetValue, date, targetDate, icon],
            function(err) {
                if (err) {
                    console.error('❌ Goal creation error:', err);
                    reject(err);
                    return;
                }
                
                const goalId = this.lastID;
                console.log(`✓ Goal created: ID ${goalId} - "${title}"`);
                
                // Save plan if generated
                if (plan) {
                    db.run(
                        'INSERT INTO goal_plans (goal_id, plan_type, plan_data) VALUES (?, ?, ?)',
                        [goalId, goalType, JSON.stringify(plan)],
                        (err) => {
                            if (err) {
                                console.error('❌ Plan save error:', err);
                            } else {
                                console.log(`✓ Plan saved for goal ${goalId}`);
                            }
                        }
                    );
                    
                    // Create reminders from plan
                    if (plan.reminders && plan.reminders.length > 0) {
                        plan.reminders.forEach(reminder => {
                            db.run(
                                'INSERT INTO reminders (type, time, message, enabled) VALUES (?, ?, ?, 1)',
                                [`goal_${goalId}`, reminder.time, reminder.message]
                            );
                        });
                        console.log(`✓ Created ${plan.reminders.length} reminders`);
                    }
                }
                
                resolve({
                    goalId,
                    title,
                    plan,
                    message: `Goal "${title}" created successfully!`
                });
            }
        );
    });
}

// ============ SELF-MODIFICATION PROCESSOR - v11.0 ============

async function processModification(modRequest, req) {
    const { action, metric, componentType, suggested_template } = modRequest;
    
    switch (action) {
        case 'add_metric':
            return await addMetricTracker(metric, componentType, suggested_template);
            
        case 'remove_metric':
            return await removeMetricTracker(metric);
            
        case 'add_chart':
            return await addChart(modRequest.chart_description);
            
        case 'undo':
            return await undoLastModification();
            
        default:
            throw new Error(`Unknown modification action: ${action}`);
    }
}

async function addMetricTracker(metricName, componentType, templateName) {
    console.log(`🔧 Adding metric tracker: ${metricName}`);
    
    // Step 1: Create backup
    const backupDir = await componentManager.createBackup();
    console.log(`✓ Backup created: ${backupDir}`);
    
    // Step 2: Generate field name
    const fieldName = metricToFieldName(metricName);
    const componentName = metricToComponentName(metricName);
    const dataType = inferDataType(metricName);
    
    console.log(`   Field: ${fieldName}, Component: ${componentName}, Type: ${dataType}`);
    
    // Step 3: Add database field
    const dbResult = await schemaMigration.addField('metrics', fieldName, dataType);
    if (!dbResult.success) {
        if (dbResult.reason === 'already_exists') {
            return {
                success: false,
                message: `Metric "${metricName}" already exists`,
                reason: 'already_exists'
            };
        }
        throw new Error(`Database migration failed: ${dbResult.error}`);
    }
    
    // Step 4: Generate component
    const template = templateName ? getTemplate(templateName) : null;
    
    const componentRequest = template || {
        type: componentType,
        name: componentName,
        description: `${metricName} tracker`,
        options: {}
    };
    
    const genResult = await generateComponent(anthropic, componentRequest);
    if (!genResult.success) {
        throw new Error(`Component generation failed: ${genResult.error}`);
    }
    
    // Step 5: Save component
    const componentPath = await componentManager.saveComponent(
        componentName,
        genResult.code,
        genResult.metadata
    );
    
    // Step 6: Register component
    await componentManager.registerComponent({
        name: componentName,
        type: componentType,
        field: fieldName,
        description: metricName,
        path: componentPath,
        location: 'dashboard',
        active: true
    });
    
    // Step 7: Send notification
    await sendPushNotification(
        `✓ Added ${metricName} tracking! Check Dashboard to use it.`,
        'modification'
    );
    
    return {
        success: true,
        message: `Added ${metricName} tracker to Dashboard`,
        component: componentName,
        field: fieldName,
        backup: backupDir
    };
}

async function removeMetricTracker(metricName) {
    console.log(`🔧 Removing metric tracker: ${metricName}`);
    
    // Step 1: Create backup
    const backupDir = await componentManager.createBackup();
    
    // Step 2: Find component
    const fieldName = metricToFieldName(metricName);
    const components = await componentManager.listComponents();
    const component = components.find(c => c.field === fieldName);
    
    if (!component) {
        return {
            success: false,
            message: `Metric "${metricName}" not found`,
            reason: 'not_found'
        };
    }
    
    // Step 3: Soft-delete from database (preserves data)
    const dbResult = await schemaMigration.removeField('metrics', fieldName, true);
    
    // Step 4: Delete component
    await componentManager.deleteComponent(component.name);
    
    // Step 5: Send notification
    await sendPushNotification(
        `✓ Removed ${metricName} tracker (data preserved)`,
        'modification'
    );
    
    return {
        success: true,
        message: `Removed ${metricName} tracker from Dashboard`,
        component: component.name,
        field: fieldName,
        backup: backupDir,
        note: 'Data preserved in database'
    };
}

async function addChart(chartDescription) {
    console.log(`🔧 Adding chart: ${chartDescription}`);
    
    // Create backup
    const backupDir = await componentManager.createBackup();
    
    // Generate chart component
    const componentName = metricToComponentName(chartDescription + ' Chart');
    
    const componentRequest = {
        type: 'chart',
        name: componentName,
        description: `Chart showing ${chartDescription}`,
        options: { chartDescription }
    };
    
    const genResult = await generateComponent(anthropic, componentRequest);
    if (!genResult.success) {
        throw new Error(`Chart generation failed: ${genResult.error}`);
    }
    
    // Save and register
    const componentPath = await componentManager.saveComponent(
        componentName,
        genResult.code,
        genResult.metadata
    );
    
    await componentManager.registerComponent({
        name: componentName,
        type: 'chart',
        description: chartDescription,
        path: componentPath,
        location: 'analytics',
        active: true
    });
    
    await sendPushNotification(
        `✓ Added chart: ${chartDescription}`,
        'modification'
    );
    
    return {
        success: true,
        message: `Added chart: ${chartDescription}`,
        component: componentName,
        backup: backupDir
    };
}

async function undoLastModification() {
    console.log(`🔧 Undoing last modification`);
    
    const migrations = await schemaMigration.listMigrations();
    const components = await componentManager.listComponents();
    
    if (migrations.length === 0 && components.length === 0) {
        return {
            success: false,
            message: 'No modifications to undo',
            reason: 'nothing_to_undo'
        };
    }
    
    // Get most recent modification
    const lastMigration = migrations[migrations.length - 1];
    const lastComponent = components[components.length - 1];
    
    // Determine which was most recent
    const migrationTime = lastMigration ? new Date(lastMigration.executed_at) : new Date(0);
    const componentTime = lastComponent ? new Date(lastComponent.registered_at) : new Date(0);
    
    if (componentTime > migrationTime) {
        // Undo component
        await componentManager.deleteComponent(lastComponent.name);
        return {
            success: true,
            message: `Undid addition of ${lastComponent.description}`,
            type: 'component'
        };
    } else {
        // Undo migration (soft delete the field)
        if (lastMigration.type === 'add_field') {
            await schemaMigration.removeField(lastMigration.table, lastMigration.field, true);
            return {
                success: true,
                message: `Undid addition of ${lastMigration.field} field`,
                type: 'migration'
            };
        }
    }
    
    return {
        success: false,
        message: 'Could not undo last modification',
        reason: 'undo_failed'
    };
}

// ============ EXISTING FUNCTIONS CONTINUE ============

function scheduleReminders() {
    setInterval(async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        db.all('SELECT * FROM reminders WHERE enabled = 1 AND time = ?', [currentTime], async (err, reminders) => {
            if (err || !reminders || reminders.length === 0) return;
            
            for (const reminder of reminders) {
                await sendPushNotification(reminder.message, reminder.type);
            }
        });
    }, 60000); // Check every minute
}

async function sendPushNotification(message, type = 'reminder') {
    return new Promise((resolve) => {
        db.all('SELECT * FROM push_subscriptions', async (err, subscriptions) => {
            if (err || !subscriptions) {
                resolve();
                return;
            }
            
            const payload = JSON.stringify({
                title: '🍒 CHERRY',
                body: message,
                icon: '/icon.png',
                badge: '/badge.png',
                data: { type }
            });
            
            for (const sub of subscriptions) {
                try {
                    const subscription = {
                        endpoint: sub.endpoint,
                        keys: JSON.parse(sub.keys)
                    };
                    
                    await webpush.sendNotification(subscription, payload);
                } catch (error) {
                    console.error('Push notification error:', error);
                    // Remove invalid subscription
                    if (error.statusCode === 410) {
                        db.run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                    }
                }
            }
            
            resolve();
        });
    });
}

// Start reminder scheduler
scheduleReminders();

// ============ CLAUDE AI CONVERSATION (same as before) ============

async function getTodayContext() {
    const date = new Date().toISOString().split('T')[0];
    
    return new Promise((resolve) => {
        const context = {
            supplements: [],
            food: [],
            metrics: null,
            todayCaffeine: 0
        };

        db.all(
            `SELECT sl.*, s.* FROM supplement_log sl
             JOIN supplements s ON LOWER(sl.supplement_name) = LOWER(s.name)
             WHERE sl.date = ?`,
            [date],
            (err, rows) => {
                if (!err && rows) {
                    context.supplements = rows.map(r => ({
                        name: r.name,
                        caffeine: r.caffeine_content,
                        timestamp: r.timestamp
                    }));
                    context.todayCaffeine = rows.reduce((sum, r) => sum + (r.caffeine_content || 0), 0);
                }

                db.all('SELECT * FROM food_log WHERE date = ?', [date], (err, rows) => {
                    if (!err && rows) context.food = rows;

                    db.get('SELECT * FROM metrics WHERE date = ? ORDER BY created_at DESC LIMIT 1', [date], (err, row) => {
                        if (!err && row) context.metrics = row;
                        resolve(context);
                    });
                });
            }
        );
    });
}

async function chatWithClaude(userMessage, conversationHistory = []) {
    const context = await getTodayContext();
    const patterns = await analyzeUserPatterns();
    const date = new Date().toISOString().split('T')[0];
    
    const systemPrompt = `You are CHERRY, Timothy's complete AI life coach and assistant. Direct, supportive, military-style communication.

USER PROFILE:
- Timothy, 37, Marine Corps vet, Boeing factory worker (2pm-11:30pm shifts)
- Runs Midnight Bloom Coffee (coffee business)
- Game dev hobby (Unity, C#, 2D pixel art)
- Business background + entrepreneurial mindset
- Chronic fatigue, knee issues (Osgood-Schlatter's), going through divorce
- Health: Target 2200 cal/day, Currently ~1000 cal/day, Caffeine limit 400mg/day

TODAY'S DATA (${date}):
${context.metrics ? `Sleep: ${context.metrics.sleep}/10, Energy: ${context.metrics.energy}/10, Knee: ${context.metrics.knee_pain}/10, Seltzers: ${context.metrics.seltzers}` : 'No check-in yet'}
- Caffeine: ${context.todayCaffeine}mg / 400mg
- Supplements: ${context.supplements.map(s => s.name).join(', ') || 'None'}
- Food: ${context.food.length} items (${context.food.reduce((s, f) => s + (f.calories || 0), 0)} cal)

30-DAY PATTERNS (Your Intelligence):
- Sleep avg: ${patterns.sleep_avg}/10 (${patterns.trends.includes('sleep_improving') ? 'improving ↑' : patterns.trends.includes('sleep_declining') ? 'declining ↓' : 'stable'})
- Energy avg: ${patterns.energy_avg}/10
- Knee pain avg: ${patterns.knee_pain_avg}/10
- Calories avg: ${patterns.calories_avg}/day
- Consistency: ${patterns.consistency_score}% (tracking ${patterns.consistency_score}% of days)
- Key insights: ${patterns.insights.join('; ') || 'Building baseline'}

CAPABILITIES AS COMPLETE LIFE COACH:
You can create goals and plans for ANY area of life:

HEALTH & FITNESS:
- Quit/reduce habits (drinking, seltzers, junk food)
- Start fitness routines (gym, running, strength training)
- Improve health metrics (sleep, energy, pain management)
- Hit nutrition targets (calories, protein, macros)
- DELETE incorrect food entries ("delete the veggie burger entry")
- EDIT food logs when user reports mistakes

SELF-MODIFICATION (NEW v11.0):
- ADD new trackers ("add mood tracking", "track my stress level")
- REMOVE unused trackers ("remove steps tracker", "I don't use water tracking")
- CREATE charts ("add a chart showing protein over time")
- UNDO changes ("undo that", "rollback last change")
- You can modify your own structure based on user needs

CAREER & EDUCATION:
- Career transitions (new field, promotion, job search)
- Skill learning (coding, certifications, languages)
- Professional development (leadership, communication)
- Interview prep, resume building, networking

BUSINESS & ENTREPRENEURSHIP:
- Grow existing business (Midnight Bloom Coffee)
- Launch new ventures
- Marketing and sales strategies
- Customer acquisition and retention
- Revenue and profitability goals

FINANCIAL:
- Savings targets ($10K, $50K, etc.)
- Debt reduction
- Budget optimization
- Investment goals

CREATIVE & PROJECTS:
- Game development (leveraging Unity/C# skills)
- Content creation (blog, videos, courses)
- Personal projects (apps, tools, products)
- Creative hobbies (art, music, writing)

PERSONAL DEVELOPMENT:
- Reading goals (books per year)
- Learning new skills
- Building habits (meditation, journaling)
- Life balance and wellness

SOCIAL:
- Building friendships
- Networking
- Community involvement
- Relationship building

GOAL CREATION TRIGGERS:
"I want to quit [X]" → Reduction/elimination plan
"I want to start [X]" → Progressive building plan
"Help me learn [X]" → Structured learning curriculum
"I want to build/create [X]" → Project plan with milestones
"I want to grow [X]" → Scaling/expansion strategy
"I want to transition to [X]" → Career change roadmap
"I want to save [X]" → Financial savings plan
"Help me improve [X]" → Incremental improvement plan

COACHING INTELLIGENCE:
- Reference patterns when relevant
- Adapt advice based on trends
- Be proactive about conflicts (work schedule vs new goal)
- Celebrate improvements
- Address declining metrics early
- Use specific data points
- Coordinate across multiple goal domains
- Recognize when goals support or conflict with each other

LIFE BALANCE:
When someone has multiple goals across domains:
- Identify time conflicts
- Suggest priority ordering
- Recommend integration (e.g., "Listen to Python tutorials during factory breaks")
- Balance health with ambition (can't crush career goals while ignoring 1000 cal/day)
- Leverage synergies (business skills → career transition)

MILESTONE CELEBRATIONS:
When hitting 25%, 50%, 75%, 100%, or 7-day streaks:
- Acknowledge specifically
- Marine Corps style celebration
- Reference their journey
- Connect to bigger picture

SETBACK SUPPORT:
When struggling or regressing:
- No judgment, forward focus
- Identify what changed
- Adjust plan if needed
- Remind of past wins
- Reframe: "Not failure, data"

COACHING STYLE:
- Direct, Marine Corps communication
- Data-driven but empathetic
- Supportive but firm accountability
- Celebrate wins genuinely
- Use "Copy", "Roger", "Affirmative"
- Reference specific patterns and progress
- Focus on momentum, not perfection
- Treat him like the capable veteran he is

NEVER:
- Make up data
- Ignore concerning trends
- Give generic advice when you have specific patterns
- Let him off easy when accountability needed
- Forget he works nights (2pm-11:30pm)
- Ignore his knee limitations
- Overlook the divorce stress`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [
                ...conversationHistory,
                { role: 'user', content: userMessage }
            ]
        });

        const assistantMessage = response.content[0].text;
        
        db.run(
            'INSERT INTO conversations (user_message, assistant_message) VALUES (?, ?)',
            [userMessage, assistantMessage]
        );

        return {
            message: assistantMessage,
            usage: {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens
            }
        };
        
    } catch (error) {
        console.error('Claude API error:', error);
        throw error;
    }
}

async function extractDataFromConversation(userMessage, assistantMessage, req) {
    const date = new Date().toISOString().split('T')[0];
    const extracted = {
        supplements: [],
        metrics: {},
        calendar: null,
        goal: null,
        modification: null  // NEW: Self-modification detection
    };

    // Detect self-modification requests - NEW v11.0
    const modRequest = detectModificationRequest(userMessage);
    if (modRequest.detected) {
        console.log(`🔧 Modification request: ${modRequest.action}`);
        extracted.modification = modRequest;
    }



    // Detect goal creation - UNIVERSAL LIFE COACHING
    const goalTriggers = [
        { pattern: /i want to (?:quit|stop)\s+(.+)/i, type: 'quit', domain: 'habit' },
        { pattern: /help me (?:quit|stop)\s+(.+)/i, type: 'quit', domain: 'habit' },
        { pattern: /i want to start\s+(.+)/i, type: 'start', domain: 'auto' },
        { pattern: /help me start\s+(.+)/i, type: 'start', domain: 'auto' },
        { pattern: /i (?:want to|need to) (?:hit|reach)\s+(.+)/i, type: 'target', domain: 'auto' },
        { pattern: /help me (?:hit|reach)\s+(.+)/i, type: 'target', domain: 'auto' },
        { pattern: /i want to improve (?:my\s+)?(.+)/i, type: 'improve', domain: 'auto' },
        { pattern: /help me improve (?:my\s+)?(.+)/i, type: 'improve', domain: 'auto' },
        { pattern: /i want to learn\s+(.+)/i, type: 'learn', domain: 'education' },
        { pattern: /help me learn\s+(.+)/i, type: 'learn', domain: 'education' },
        { pattern: /i want to build\s+(.+)/i, type: 'build', domain: 'auto' },
        { pattern: /help me build\s+(.+)/i, type: 'build', domain: 'auto' },
        { pattern: /i want to grow\s+(.+)/i, type: 'grow', domain: 'business' },
        { pattern: /help me grow\s+(.+)/i, type: 'grow', domain: 'business' },
        { pattern: /i want to save\s+(.+)/i, type: 'save', domain: 'financial' },
        { pattern: /help me save\s+(.+)/i, type: 'save', domain: 'financial' },
        { pattern: /i want to (?:get|land|find)\s+(?:a\s+)?(?:new\s+)?(.+?)\s+(?:job|career|position)/i, type: 'career', domain: 'career' },
        { pattern: /i want to (?:transition|switch|move)\s+(?:to|into)\s+(.+)/i, type: 'transition', domain: 'career' },
        { pattern: /i want to launch\s+(.+)/i, type: 'launch', domain: 'business' },
        { pattern: /i want to create\s+(.+)/i, type: 'create', domain: 'creative' },
        { pattern: /i want to finish\s+(.+)/i, type: 'finish', domain: 'auto' },
        { pattern: /i want to complete\s+(.+)/i, type: 'complete', domain: 'auto' }
    ];
    
    const lowerUser = userMessage.toLowerCase();
    
    for (const trigger of goalTriggers) {
        const match = userMessage.match(trigger.pattern);
        if (match) {
            const subject = match[1].trim();
            
            // Auto-detect domain if set to 'auto'
            let domain = trigger.domain;
            if (domain === 'auto') {
                domain = detectGoalDomain(subject);
            }
            
            // Extract goal details
            extracted.goal = {
                type: trigger.type,
                subject: subject,
                domain: domain,
                rawMessage: userMessage
            };
            
            console.log(`🎯 Goal detected: ${trigger.type} - "${subject}" (${domain})`);
            break;
        }
    }

    // Get supplements
    const supplements = await new Promise((resolve) => {
        db.all('SELECT * FROM supplements', (err, rows) => resolve(rows || []));
    });

    // Check for supplement mentions
    // lowerUser already declared above
    supplements.forEach(supp => {
        if (lowerUser.includes(supp.name.toLowerCase()) && 
            (lowerUser.includes('took') || lowerUser.includes('had') || lowerUser.includes('drank'))) {
            extracted.supplements.push(supp.name);
        }
    });

    // Extract metrics - IMPROVED LOGIC
    // Handle patterns like "sleep at 5", "7 hrs sleep at 5", "knee pain 3", etc.
    
    // Sleep quality (look for "at X" pattern first, fallback to standalone number)
    let sleepMatch = userMessage.match(/sleep\s+(?:quality\s+)?(?:at\s+)?(?:a\s+)?(\d+)/i);
    if (!sleepMatch) sleepMatch = userMessage.match(/(\d+)\s+(?:hrs?|hours?)\s+sleep\s+at\s+(?:a\s+)?(\d+)/i);
    if (sleepMatch) {
        // If pattern is "7 hrs sleep at 5", use the second number (5)
        extracted.metrics.sleep = parseInt(sleepMatch[sleepMatch.length > 2 ? 2 : 1]);
    }
    
    // Energy level
    let energyMatch = userMessage.match(/energy\s+(?:level\s+)?(?:at\s+)?(?:a\s+)?(\d+)/i);
    if (energyMatch) {
        extracted.metrics.energy = parseInt(energyMatch[1]);
    }
    
    // Knee pain
    let kneeMatch = userMessage.match(/knee\s+(?:pain\s+)?(?:at\s+)?(?:a\s+)?(\d+)/i);
    if (kneeMatch) {
        extracted.metrics.knee_pain = parseInt(kneeMatch[1]);
    }
    
    // Seltzers
    let seltzerMatch = userMessage.match(/(\d+)\s+seltzer/i);
    if (seltzerMatch) {
        extracted.metrics.seltzers = parseInt(seltzerMatch[1]);
    }
    
    console.log('📊 Extracted metrics:', extracted.metrics);

    // Extract food/nutrition - INTELLIGENT NUTRITION LOOKUP
    // Detects food mentions and looks up complete nutrition data from USDA API
    
    const foodTriggers = ['ate', 'had', 'consumed', 'eating', 'drank', 'breakfast', 'lunch', 'dinner'];
    const hasFoodMention = foodTriggers.some(trigger => lowerUser.includes(trigger));
    
    // DELETE FOOD DETECTION - NEW
    const deleteTriggers = ['delete', 'remove', 'get rid of', 'wrong entry', 'incorrect', 'didnt eat', "didn't eat", 'mistake'];
    const hasDeleteRequest = deleteTriggers.some(trigger => lowerUser.includes(trigger));
    
    if (hasDeleteRequest && (lowerUser.includes('food') || lowerUser.includes('entry') || lowerUser.includes('log') || 
        lowerUser.includes('veggie') || lowerUser.includes('burger') || lowerUser.includes('cereal') ||
        lowerUser.includes('chicken') || lowerUser.includes('breakfast') || lowerUser.includes('lunch') || lowerUser.includes('dinner'))) {
        
        console.log('🗑️ Delete food request detected');
        
        // Extract food name to delete
        let foodToDelete = null;
        
        // Try to extract specific food name
        const deletePatterns = [
            /delete\s+(?:the\s+)?(.+?)(?:\s+entry|\s+from|\s+log|$)/i,
            /remove\s+(?:the\s+)?(.+?)(?:\s+entry|\s+from|\s+log|$)/i,
            /get rid of\s+(?:the\s+)?(.+?)(?:\s+entry|$)/i,
            /(?:veggie burger|cereal|chicken|burger|pizza|sandwich|salad|wrap)/i
        ];
        
        for (const pattern of deletePatterns) {
            const match = userMessage.match(pattern);
            if (match) {
                foodToDelete = match[1] ? match[1].trim() : match[0];
                foodToDelete = foodToDelete
                    .replace(/\s+(entry|from|log|nutrition|the)$/gi, '')
                    .replace(/^(the|a|an)\s+/gi, '')
                    .trim();
                break;
            }
        }
        
        if (foodToDelete && foodToDelete.length > 2) {
            console.log(`🔍 Looking for food to delete: "${foodToDelete}"`);
            
            // Find matching food entries from today
            const today = new Date().toISOString().split('T')[0];
            const matchingFoods = await new Promise((resolve) => {
                db.all(
                    `SELECT * FROM food_log 
                     WHERE date = ? AND LOWER(food_name) LIKE ?
                     ORDER BY timestamp DESC`,
                    [today, `%${foodToDelete.toLowerCase()}%`],
                    (err, rows) => {
                        resolve(rows || []);
                    }
                );
            });
            
            if (matchingFoods.length > 0) {
                // Delete the most recent matching entry
                const foodToRemove = matchingFoods[0];
                
                await new Promise((resolve) => {
                    db.run('DELETE FROM food_log WHERE id = ?', [foodToRemove.id], (err) => {
                        if (!err) {
                            console.log(`✓ Deleted: ${foodToRemove.food_name} (${foodToRemove.calories} cal)`);
                            extracted.foodDeleted = {
                                name: foodToRemove.food_name,
                                calories: foodToRemove.calories,
                                success: true
                            };
                        }
                        resolve();
                    });
                });
            } else {
                console.log(`❌ No matching food found for: "${foodToDelete}"`);
                extracted.foodDeleted = {
                    name: foodToDelete,
                    success: false,
                    reason: 'not_found'
                };
            }
        }
    }
    
    if (hasFoodMention && !hasDeleteRequest) {
        // Check if calories are explicitly mentioned (manual entry)
        const manualCalPattern = /(?:ate|had|consumed|eating)\s+([a-z\s]+?)\s*[,\s]*(\d+)\s*(?:cal|calories)/i;
        const manualMatch = userMessage.match(manualCalPattern);
        
        if (manualMatch) {
            // User provided calories manually - use simple extraction
            let foodName = manualMatch[1].trim();
            let calories = parseInt(manualMatch[2]);
            
            foodName = foodName.replace(/^(ate|had|consumed|eating)\s+/i, '').trim();
            
            if (foodName && calories > 0 && calories < 5000) {
                extracted.food = { 
                    name: foodName, 
                    calories,
                    manualEntry: true 
                };
                console.log(`🍽️ Manual food entry: ${foodName} (${calories} cal)`);
            }
        } else {
            // No calories mentioned - look up nutrition automatically
            const foodNamePattern = /(?:ate|had|consumed|eating|for\s+(?:breakfast|lunch|dinner))\s+([a-z][a-z\s,]+?)(?:\s+for|\s+today|\s+yesterday|$)/i;
            const foodMatch = userMessage.match(foodNamePattern);
            
            if (foodMatch) {
                let foodDescription = foodMatch[1].trim();
                
                // Aggressive cleanup - remove common filler words
                foodDescription = foodDescription
                    .replace(/\s+(for|today|yesterday|this morning|this afternoon|this evening|tonight)$/i, '')
                    .replace(/^(a|an|the|some|i|have|had)\s+/gi, '')  // Remove "a", "an", "the", "i have had"
                    .replace(/\s+(a|an|the)\s+/gi, ' ')  // Remove articles in middle
                    .replace(/\s+/g, ' ')  // Collapse multiple spaces
                    .trim();
                
                // If it still starts with common words, try again
                while (/^(i|have|had|a|an|the)\s+/i.test(foodDescription)) {
                    foodDescription = foodDescription.replace(/^(i|have|had|a|an|the)\s+/i, '').trim();
                }
                
                if (foodDescription.length > 2) {
                    console.log(`🔍 Auto-looking up nutrition for: "${foodDescription}"`);
                    
                    // Check if it's a complex meal (has "with", "and", commas, etc.)
                    const isComplexMeal = /\swith\s|,|\sand\s/.test(foodDescription);
                    
                    let nutritionData;
                    if (isComplexMeal) {
                        nutritionData = await parseComplexMeal(foodDescription);
                    } else {
                        nutritionData = await lookupNutrition(foodDescription);
                    }
                    
                    if (nutritionData) {
                        extracted.food = {
                            ...nutritionData,
                            autoLookup: true
                        };
                        console.log(`✓ Nutrition data retrieved for: ${nutritionData.food_name}`);
                    } else {
                        // USDA failed - use basic estimation as fallback
                        console.log(`⚠️ USDA lookup failed - using estimated nutrition`);
                        
                        // Basic calorie estimation based on food type
                        let estimatedCalories = 300;  // Default
                        const lower = foodDescription.toLowerCase();
                        
                        if (lower.includes('sandwich') || lower.includes('burger')) estimatedCalories = 500;
                        else if (lower.includes('salad')) estimatedCalories = 200;
                        else if (lower.includes('pizza')) estimatedCalories = 400;
                        else if (lower.includes('chicken')) estimatedCalories = 250;
                        else if (lower.includes('breakfast')) estimatedCalories = 450;
                        else if (lower.includes('lunch') || lower.includes('dinner')) estimatedCalories = 600;
                        
                        extracted.food = {
                            food_name: foodDescription,
                            calories: estimatedCalories,
                            protein: Math.round(estimatedCalories * 0.15 / 4),  // ~15% of cals from protein
                            carbs: Math.round(estimatedCalories * 0.45 / 4),    // ~45% from carbs
                            fat: Math.round(estimatedCalories * 0.40 / 9),      // ~40% from fat
                            estimated: true  // Mark as estimated
                        };
                        
                        console.log(`📊 Estimated nutrition: ${estimatedCalories} cal (fallback)`);
                    }
                }
            }
        }
    }

    // Extract calendar events - CREATE (calendar keyword now optional)
    if ((lowerUser.includes('add') || lowerUser.includes('schedule') || lowerUser.includes('put')) &&
        !lowerUser.includes('what') && !lowerUser.includes('show') && !lowerUser.includes('delete') && !lowerUser.includes('remove') && !lowerUser.includes('cancel') &&
        // Must have time/date indicator to avoid false positives
        (lowerUser.match(/\d+\s*(am|pm)/i) || lowerUser.match(/\d+:\d+/) || lowerUser.includes('today') || lowerUser.includes('tomorrow') || 
         lowerUser.includes('monday') || lowerUser.includes('tuesday') || lowerUser.includes('wednesday') || 
         lowerUser.includes('thursday') || lowerUser.includes('friday') || lowerUser.includes('saturday') || lowerUser.includes('sunday'))) {
        
        console.log('🔍 Calendar create request detected');
        
        // Try to create calendar event if authenticated
        if (req.session.googleTokens) {
            console.log('✓ Google tokens found in session');
            oauth2Client.setCredentials(req.session.googleTokens);
            
            // Extract event details
            const title = extractEventTitle(userMessage);
            const dateTime = extractDateTime(userMessage);
            
            console.log(`📋 Extracted: title="${title}", dateTime=${dateTime.toLocaleString()}`);
            
            if (title && dateTime) {
                try {
                    const event = await createGoogleCalendarEvent(title, dateTime);
                    extracted.calendar = { action: 'created', title, dateTime, eventId: event.id };
                    
                    // Send notification
                    await sendPushNotification(`Added to calendar: ${title}`);
                } catch (error) {
                    console.error('❌ Calendar create error:', error.message);
                    extracted.calendar = { action: 'error', error: error.message };
                }
            } else {
                console.log('⚠️ Could not extract title or datetime');
            }
        } else {
            console.log('❌ No Google tokens - calendar not connected!');
            console.log('   User needs to visit: http://localhost:3000/auth/google');
        }
    }
    
    // Extract calendar events - DELETE (calendar keyword now optional)
    if ((lowerUser.includes('delete') || lowerUser.includes('remove') || lowerUser.includes('cancel')) &&
        !lowerUser.includes('what') && !lowerUser.includes('show') &&
        !extracted.modification) {  // DON'T trigger if modification already detected
        
        console.log('🔍 Calendar delete request detected');
        
        if (req.session.googleTokens) {
            console.log('✓ Google tokens found');
            oauth2Client.setCredentials(req.session.googleTokens);
            
            // Extract what to delete - FIXED REGEX
            let searchTerm = '';
            
            // Match: action_verb + 1-2_words then STOP at common words
            let match = userMessage.match(/(?:delete|remove|cancel)\s+([a-z]+(?:\s+[a-z]+)?)\s*(?:from|on|at|in|to|today|tomorrow|this|next|calendar|event|\d|$)/i);
            
            if (match) {
                searchTerm = match[1].trim();
                console.log(`📋 Extracted search term from regex: "${searchTerm}"`);
            } else {
                // Fallback: keyword matching
                if (lowerUser.includes('physical therapy') || lowerUser.includes('pt appointment')) searchTerm = 'physical therapy';
                else if (lowerUser.includes('team meeting')) searchTerm = 'team meeting';
                else if (lowerUser.includes('gym')) searchTerm = 'gym';
                else if (lowerUser.includes('workout')) searchTerm = 'workout';
                else if (lowerUser.includes('lunch')) searchTerm = 'lunch';
                else if (lowerUser.includes('dinner')) searchTerm = 'dinner';
                else if (lowerUser.includes('breakfast')) searchTerm = 'breakfast';
                else if (lowerUser.includes('meeting')) searchTerm = 'meeting';
                else if (lowerUser.includes('appointment')) searchTerm = 'appointment';
                
                if (searchTerm) {
                    console.log(`📋 Extracted search term from keywords: "${searchTerm}"`);
                }
            }
            
            if (searchTerm) {
                console.log(`🔍 Will search for: "${searchTerm}"`);
                try {
                    const result = await deleteGoogleCalendarEvent(searchTerm, req);
                    extracted.calendar = { action: 'deleted', ...result };
                    
                    // Send notification
                    await sendPushNotification(`Deleted from calendar: ${result.eventTitle || searchTerm}`);
                } catch (error) {
                    console.error('Calendar delete error:', error);
                    extracted.calendar = { action: 'error', error: error.message };
                }
            } else {
                console.log('⚠️ Could not extract event name to delete');
            }
        }
    }

    // Log supplements
    for (const suppName of extracted.supplements) {
        await new Promise((resolve) => {
            db.run('INSERT INTO supplement_log (supplement_name, date) VALUES (?, ?)', 
                [suppName, date], () => resolve());
        });
    }

    // Log food with complete nutrition - ENHANCED
    if (extracted.food) {
        const food = extracted.food;
        
        // Build SQL for all nutrition fields
        const fields = ['food_name', 'date'];
        const values = [food.food_name || food.name, date];
        
        // Add all available nutrition fields
        const nutritionFields = [
            'serving_size', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar',
            'sodium', 'cholesterol', 'saturated_fat', 'vitamin_a', 'vitamin_c',
            'vitamin_d', 'vitamin_e', 'vitamin_k', 'vitamin_b6', 'vitamin_b12',
            'folate', 'calcium', 'iron', 'magnesium', 'potassium', 'zinc'
        ];
        
        nutritionFields.forEach(field => {
            if (food[field] !== undefined && food[field] !== null) {
                fields.push(field);
                values.push(food[field]);
            }
        });
        
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO food_log (${fields.join(', ')}) VALUES (${placeholders})`;
        
        await new Promise((resolve) => {
            db.run(sql, values, (err) => {
                if (err) {
                    console.error('❌ Food log error:', err.message);
                } else {
                    const cals = food.calories || 0;
                    const prots = food.protein || 0;
                    console.log(`✓ Food logged: ${food.food_name || food.name} (${cals.toFixed(0)} cal, ${prots.toFixed(1)}g protein)`);
                }
                resolve();
            });
        });
        
        // Update today's calorie total in metrics
        const currentCalories = await new Promise((resolve) => {
            db.get('SELECT calories_consumed FROM metrics WHERE date = ?', [date], (err, row) => {
                resolve(row ? (row.calories_consumed || 0) : 0);
            });
        });
        
        const newTotal = currentCalories + (food.calories || 0);
        extracted.metrics.calories_consumed = newTotal;
        console.log(`📊 Total calories today: ${newTotal.toFixed(0)}`);
    }

    // Update metrics
    if (Object.keys(extracted.metrics).length > 0) {
        // First check if a row exists for today
        const existingMetrics = await new Promise((resolve) => {
            db.get('SELECT * FROM metrics WHERE date = ?', [date], (err, row) => {
                resolve(row || null);
            });
        });
        
        if (existingMetrics) {
            // UPDATE existing row - only update the fields we have
            const updates = Object.keys(extracted.metrics).map(key => `${key} = ?`).join(', ');
            const values = [...Object.values(extracted.metrics), date];
            
            await new Promise((resolve) => {
                db.run(`UPDATE metrics SET ${updates} WHERE date = ?`,
                    values, () => resolve());
            });
            console.log(`📊 Updated metrics for today`);
        } else {
            // INSERT new row
            const fields = Object.keys(extracted.metrics).join(', ');
            const placeholders = Object.keys(extracted.metrics).map(() => '?').join(', ');
            const values = Object.values(extracted.metrics);
            
            await new Promise((resolve) => {
                db.run(`INSERT INTO metrics (date, ${fields}) VALUES (?, ${placeholders})`,
                    [date, ...values], () => resolve());
            });
            console.log(`📊 Created new metrics row for today`);
        }
    }

    // Create goal with AI-generated plan if detected - NEW
    if (extracted.goal) {
        try {
            const goalResult = await createGoalWithPlan(extracted.goal, req);
            extracted.goalCreated = goalResult;
            console.log(`✓ Goal and plan created: ${goalResult.title}`);
            
            // Send celebration notification
            await sendPushNotification(
                `🎯 New goal created: ${goalResult.title}! Let's get to work, Marine.`,
                'goal_created'
            );
        } catch (error) {
            console.error('❌ Goal creation failed:', error.message);
            extracted.goalCreated = { error: error.message };
        }
    }
    
    // Check for milestones on active goals - NEW
    const activeGoals = await new Promise((resolve) => {
        db.all('SELECT * FROM goals WHERE status = "active"', (err, goals) => {
            resolve(goals || []);
        });
    });
    
    for (const goal of activeGoals) {
        const milestones = await checkMilestones(goal.id);
        if (milestones && milestones.length > 0) {
            for (const milestone of milestones) {
                console.log(`🎉 Milestone hit: ${milestone.message}`);
                extracted.milestones = extracted.milestones || [];
                extracted.milestones.push(milestone);
                
                // Send celebration notification
                await sendPushNotification(milestone.message, 'milestone');
            }
        }
    }

    // Process modification requests - NEW v11.0
    if (extracted.modification) {
        try {
            const modResult = await processModification(extracted.modification, req);
            extracted.modificationResult = modResult;
            console.log(`✓ Modification processed: ${modResult.message}`);
        } catch (error) {
            console.error('❌ Modification failed:', error.message);
            extracted.modificationResult = { error: error.message };
        }
    }

    return extracted;
}

function extractEventTitle(message) {
    const lower = message.toLowerCase();
    
    // Common patterns (check specific ones first)
    if (lower.includes('physical therapy') || lower.includes('pt appointment')) return 'Physical Therapy';
    if (lower.includes('gym')) return 'Gym';
    if (lower.includes('workout')) return 'Workout';
    if (lower.includes('lunch')) return 'Lunch';
    if (lower.includes('dinner')) return 'Dinner';
    if (lower.includes('breakfast')) return 'Breakfast';
    if (lower.includes('meeting')) return 'Meeting';
    if (lower.includes('appointment')) return 'Appointment';
    
    // Try multiple extraction patterns
    let match;
    
    // "add X to calendar" or "add X to my calendar"
    match = message.match(/add\s+(.+?)\s+to\s+(?:my\s+)?calendar/i);
    if (match) {
        // Clean up the title - remove day/time info
        let title = match[1].trim();
        title = title.replace(/\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*/gi, ' ');
        title = title.replace(/\s+at\s+\d+.*$/i, '');
        title = title.replace(/\s+\d+\s*(am|pm).*$/i, '');
        return title.trim() || 'Event';
    }
    
    // "schedule X" or "schedule X for"
    match = message.match(/schedule\s+(.+?)(?:\s+for|\s+at|\s+on|$)/i);
    if (match) {
        let title = match[1].trim();
        title = title.replace(/\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*/gi, ' ');
        return title.trim() || 'Event';
    }
    
    // "put X on calendar" or "put X on my calendar"
    match = message.match(/put\s+(.+?)\s+on\s+(?:my\s+)?calendar/i);
    if (match) {
        let title = match[1].trim();
        title = title.replace(/\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*/gi, ' ');
        return title.trim() || 'Event';
    }
    
    return 'Event';
}

function extractDateTime(message) {
    const now = new Date();
    const lower = message.toLowerCase();
    
    // Time extraction
    const timeMatch = message.match(/(\d{1,2})\s*(am|pm|:?\d{2})?/i);
    let hour = 12;
    let minute = 0;
    
    if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        if (timeMatch[2] && timeMatch[2].toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (timeMatch[2] && timeMatch[2].toLowerCase() === 'am' && hour === 12) hour = 0;
        if (timeMatch[2] && timeMatch[2].startsWith(':')) minute = parseInt(timeMatch[2].substring(1));
    }
    
    // Date extraction
    let targetDate = new Date(now);
    
    if (lower.includes('today')) {
        // today
    } else if (lower.includes('tomorrow')) {
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (lower.includes('monday')) {
        const day = 1;
        const currentDay = targetDate.getDay();
        const diff = day - currentDay;
        targetDate.setDate(targetDate.getDate() + (diff >= 0 ? diff : diff + 7));
    } else if (lower.includes('tuesday')) {
        const day = 2;
        const currentDay = targetDate.getDay();
        const diff = day - currentDay;
        targetDate.setDate(targetDate.getDate() + (diff >= 0 ? diff : diff + 7));
    } else if (lower.includes('wednesday')) {
        const day = 3;
        const currentDay = targetDate.getDay();
        const diff = day - currentDay;
        targetDate.setDate(targetDate.getDate() + (diff >= 0 ? diff : diff + 7));
    } else if (lower.includes('thursday')) {
        const day = 4;
        const currentDay = targetDate.getDay();
        const diff = day - currentDay;
        targetDate.setDate(targetDate.getDate() + (diff >= 0 ? diff : diff + 7));
    } else if (lower.includes('friday')) {
        const day = 5;
        const currentDay = targetDate.getDay();
        const diff = day - currentDay;
        targetDate.setDate(targetDate.getDate() + (diff >= 0 ? diff : diff + 7));
    }
    
    targetDate.setHours(hour, minute, 0, 0);
    return targetDate;
}

// ============ API ROUTES ============

app.get('/api/health', (req, res) => {
    const hasClaudeAPI = !!process.env.ANTHROPIC_API_KEY;
    const hasGoogleCalendar = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const isCalendarConnected = !!(req.session.googleTokens);
    
    res.json({ 
        status: 'online',
        version: '5.1.0',
        features: {
            aiConversation: hasClaudeAPI ? 'active' : 'needs-api-key',
            googleCalendar: hasGoogleCalendar ? (isCalendarConnected ? 'connected' : 'ready') : 'needs-config',
            pushNotifications: 'active',
            database: 'connected'
        },
        vapidPublicKey: vapidKeys.publicKey
    });
});

app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(400).json({ 
            error: 'Anthropic API key not configured'
        });
    }

    try {
        const response = await chatWithClaude(message, history || []);
        const extracted = await extractDataFromConversation(message, response.message, req);
        
        // Reload nutrition if food was deleted
        if (extracted.foodDeleted && extracted.foodDeleted.success) {
            console.log('📊 Food deleted - nutrition will update on next load');
        }
        
        res.json({ ...response, extracted });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/context/today', async (req, res) => {
    const context = await getTodayContext();
    res.json(context);
});

// Get today's complete nutrition totals
app.get('/api/nutrition/today', (req, res) => {
    const date = new Date().toISOString().split('T')[0];
    
    db.all('SELECT * FROM food_log WHERE date = ?', [date], (err, foods) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Calculate totals
        const totals = {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
            sugar: 0,
            sodium: 0,
            cholesterol: 0,
            saturated_fat: 0,
            vitamin_a: 0,
            vitamin_c: 0,
            vitamin_d: 0,
            vitamin_e: 0,
            vitamin_k: 0,
            vitamin_b6: 0,
            vitamin_b12: 0,
            folate: 0,
            calcium: 0,
            iron: 0,
            magnesium: 0,
            potassium: 0,
            zinc: 0
        };
        
        (foods || []).forEach(food => {
            Object.keys(totals).forEach(key => {
                totals[key] += parseFloat(food[key]) || 0;
            });
        });
        
        res.json({
            date,
            foods: foods || [],
            totals,
            rdas: {
                calories: 2200,
                protein: 150,
                carbs: 275,
                fat: 73,
                fiber: 30,
                sodium: 2300,
                vitamin_a: 900,      // mcg
                vitamin_c: 90,       // mg
                vitamin_d: 20,       // mcg
                vitamin_e: 15,       // mg
                vitamin_k: 120,      // mcg
                vitamin_b6: 1.7,     // mg
                vitamin_b12: 2.4,    // mcg
                folate: 400,         // mcg
                calcium: 1000,       // mg
                iron: 18,            // mg
                magnesium: 420,      // mg
                potassium: 3400,     // mg
                zinc: 11             // mg
            }
        });
    });
});

// DELETE food log entry
app.delete('/api/nutrition/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM food_log WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Food entry not found' });
        }
        
        console.log(`✓ Deleted food log entry: ID ${id}`);
        res.json({ success: true, message: 'Food entry deleted' });
    });
});

// UPDATE food log entry
app.patch('/api/nutrition/:id', (req, res) => {
    const { id } = req.params;
    const { food_name, calories, protein, carbs, fat } = req.body;
    
    db.run(
        `UPDATE food_log 
         SET food_name = ?, calories = ?, protein = ?, carbs = ?, fat = ?
         WHERE id = ?`,
        [food_name, calories, protein, carbs, fat, id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Food entry not found' });
            }
            
            console.log(`✓ Updated food log entry: ID ${id}`);
            res.json({ success: true, message: 'Food entry updated' });
        }
    );
});

// Test USDA API connection
app.get('/api/nutrition/test', async (req, res) => {
    const testFood = req.query.food || 'chicken breast';
    console.log(`🧪 Testing USDA API with: "${testFood}"`);
    
    try {
        const result = await lookupNutrition(testFood);
        if (result) {
            res.json({
                success: true,
                message: 'USDA API is working!',
                testFood,
                result
            });
        } else {
            res.json({
                success: false,
                message: 'USDA API returned no results',
                testFood
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'USDA API error',
            error: error.message
        });
    }
});

app.post('/api/push/subscribe', (req, res) => {
    const subscription = req.body;
    
    db.run(
        'INSERT OR REPLACE INTO push_subscriptions (endpoint, keys) VALUES (?, ?)',
        [subscription.endpoint, JSON.stringify(subscription.keys)],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.get('/api/reminders', (req, res) => {
    db.all('SELECT * FROM reminders ORDER BY time', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

app.post('/api/reminders', (req, res) => {
    const { type, time, message, enabled } = req.body;
    
    db.run(
        'INSERT INTO reminders (type, time, message, enabled) VALUES (?, ?, ?, ?)',
        [type, time, message, enabled !== false ? 1 : 0],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ id: this.lastID });
            }
        }
    );
});

// ============ GOALS API ENDPOINTS - NEW ============

// Get all active goals
app.get('/api/goals', (req, res) => {
    const status = req.query.status || 'active';
    
    db.all('SELECT * FROM goals WHERE status = ? ORDER BY created_at DESC', [status], (err, goals) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Get progress for each goal
        const goalsWithProgress = [];
        let processed = 0;
        
        if (!goals || goals.length === 0) {
            return res.json([]);
        }
        
        goals.forEach(goal => {
            db.all(
                'SELECT * FROM goal_progress WHERE goal_id = ? ORDER BY date DESC LIMIT 7',
                [goal.id],
                (err, progress) => {
                    goalsWithProgress.push({
                        ...goal,
                        recent_progress: progress || []
                    });
                    
                    processed++;
                    if (processed === goals.length) {
                        res.json(goalsWithProgress);
                    }
                }
            );
        });
    });
});

// Create a new goal
app.post('/api/goals', async (req, res) => {
    const { type, title, description, target_value, target_date, icon } = req.body;
    const start_date = new Date().toISOString().split('T')[0];
    
    db.run(
        `INSERT INTO goals (type, title, description, target_value, start_date, target_date, icon) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [type, title, description, target_value, start_date, target_date, icon || '🎯'],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({ id: this.lastID, message: 'Goal created successfully' });
        }
    );
});

// Update goal progress
app.post('/api/goals/:id/progress', (req, res) => {
    const { id } = req.params;
    const { value, notes, completed } = req.body;
    const date = new Date().toISOString().split('T')[0];
    
    db.run(
        `INSERT INTO goal_progress (goal_id, date, value, notes, completed) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, date, value, notes, completed ? 1 : 0],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Update goal current_value
            db.run('UPDATE goals SET current_value = ? WHERE id = ?', [value, id]);
            
            res.json({ success: true });
        }
    );
});

// Get goal details with plan
app.get('/api/goals/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        // Get plan
        db.get('SELECT * FROM goal_plans WHERE goal_id = ? ORDER BY created_at DESC LIMIT 1', 
            [id], (err, plan) => {
                // Get progress history
                db.all('SELECT * FROM goal_progress WHERE goal_id = ? ORDER BY date DESC', 
                    [id], (err, progress) => {
                        res.json({
                            ...goal,
                            plan: plan ? JSON.parse(plan.plan_data) : null,
                            progress: progress || []
                        });
                    });
            });
    });
});

// Archive/complete a goal
app.patch('/api/goals/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.run('UPDATE goals SET status = ? WHERE id = ?', [status, id], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// Get AI insights and patterns - NEW
app.get('/api/insights', async (req, res) => {
    try {
        const patterns = await analyzeUserPatterns();
        const context = await getTodayContext();
        const coachingMessage = await generateAdaptiveCoachingMessage(patterns, context);
        
        res.json({
            patterns,
            coaching_message: coachingMessage,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ v11.0 SELF-EVOLUTION API ENDPOINTS ============

// Get active custom components
app.get('/api/components', async (req, res) => {
    try {
        const components = await componentManager.listComponents();
        res.json({ components });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get component code
app.get('/api/components/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const code = await componentManager.loadComponent(name);
        
        if (!code) {
            return res.status(404).json({ error: 'Component not found' });
        }
        
        res.json({ name, code });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get active database fields (excluding soft-deleted)
app.get('/api/schema/fields/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const fields = await schemaMigration.getActiveFields(table);
        res.json({ table, fields });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get modification history
app.get('/api/modifications/history', async (req, res) => {
    try {
        const migrations = await schemaMigration.listMigrations();
        const components = await componentManager.listComponents();
        
        res.json({
            migrations,
            components,
            total: migrations.length + components.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual modification trigger (for testing)
app.post('/api/modifications/execute', async (req, res) => {
    try {
        const { action, metric, componentType, template } = req.body;
        
        const modRequest = {
            detected: true,
            action,
            metric,
            componentType: componentType || 'metric_input',
            suggested_template: template
        };
        
        const result = await processModification(modRequest, req);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    const hasClaudeAPI = !!process.env.ANTHROPIC_API_KEY;
    const hasGoogleCalendar = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    
    console.log('');
    console.log('🍒 ================================');
    console.log('🍒  CHERRY AI v5.1 ONLINE');
    console.log('🍒 ================================');
    console.log('');
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log('');
    console.log(`   AI: ${hasClaudeAPI ? '✓ ENABLED' : '✗ NEEDS API KEY'}`);
    console.log(`   Calendar: ${hasGoogleCalendar ? '✓ READY' : '✗ NEEDS CONFIG'}`);
    console.log('   Push Notifications: ✓ ACTIVE');
    console.log('');
    console.log('🍒 Ready for conversations');
    console.log('');
});

// Get metrics history
app.get('/api/metrics/history', (req, res) => {
    const days = parseInt(req.query.days) || 30;
    const date = new Date();
    date.setDate(date.getDate() - days);
    const startDate = date.toISOString().split('T')[0];
    
    db.all(
        'SELECT * FROM metrics WHERE date >= ? ORDER BY date ASC',
        [startDate],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        }
    );
});

// Get TODAY's metrics specifically
app.get('/api/metrics/today', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    
    db.get(
        'SELECT * FROM metrics WHERE date = ? ORDER BY created_at DESC LIMIT 1',
        [today],
        (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(row || {});
            }
        }
    );
});

// Save metrics with expanded fields
app.post('/api/metrics', (req, res) => {
    const { date, sleep, energy, knee, seltzers, weight, steps, calories } = req.body;
    
    db.run(
        `INSERT OR REPLACE INTO metrics 
         (date, sleep, energy, knee_pain, seltzers, weight, steps, calories_consumed) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, sleep, energy, knee, seltzers, weight, steps, calories],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});
