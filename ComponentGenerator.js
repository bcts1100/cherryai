// ============ AI COMPONENT GENERATOR - v11.0 ============
// Uses Claude API to generate React components dynamically

async function generateComponent(anthropic, componentRequest, userContext = {}) {
    const { type, name, description, options } = componentRequest;
    
    const generationPrompt = `You are CHERRY's component generator. Generate a React component for: ${description}

COMPONENT TYPE: ${type}
COMPONENT NAME: ${name}
OPTIONS: ${JSON.stringify(options || {})}

USER CONTEXT:
- Timothy, 37, Marine vet, Boeing factory worker
- Prefers direct, minimal UI
- Dark woodsy theme: black background, forest greens
- Mobile-first responsive design

REQUIREMENTS:
1. Functional component using React hooks (useState, useEffect)
2. Styled inline with theme colors (no external CSS)
3. Include onSave callback prop: onSave(fieldName, value)
4. Input validation where appropriate
5. Mobile-optimized (touch targets 44px minimum)
6. Return JSX (will be compiled by Babel in browser)

THEME COLORS (use these):
- Background: #000000
- Card: rgba(26, 47, 26, 0.5)
- Primary: #4A9E4A
- Gold: #D4AF37
- Text: #F5DEB3
- Accent: #9ACD32
- Sage: #8F9779
- Red: #FF6B6B
- Amber: #FFB84D

FORMAT:
export default function ${name}({ onSave }) {
    const [value, setValue] = useState(null);
    
    return (
        <div className="metric-card">
            <div className="metric-label">Label Here</div>
            {/* component UI */}
        </div>
    );
}

Return ONLY the component code. Use JSX syntax.
No explanation, no markdown backticks, just the code.`;

    try {
        console.log(`🤖 Generating component: ${name}...`);
        
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [
                { role: 'user', content: generationPrompt }
            ]
        });

        let generatedCode = response.content[0].text.trim();
        
        // Remove markdown code fences if present
        generatedCode = generatedCode.replace(/^```(?:jsx?|javascript)?\n?/gm, '').replace(/```$/gm, '');
        
        // Validate it starts with export default
        if (!generatedCode.startsWith('export default function')) {
            throw new Error('Generated code does not start with export default function');
        }

        console.log(`✓ Generated component: ${name} (${generatedCode.length} chars)`);
        
        return {
            success: true,
            code: generatedCode,
            metadata: {
                name,
                type,
                description,
                generated_at: new Date().toISOString(),
                tokens_used: response.usage.output_tokens
            }
        };
        
    } catch (error) {
        console.error(`❌ Component generation failed:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Component templates for common types
const componentTemplates = {
    mood_tracker: {
        type: 'emoji_select',
        description: 'Mood tracking with 5 emoji options',
        options: {
            emojis: ['😊', '🙂', '😐', '😕', '😢'],
            values: [5, 4, 3, 2, 1],
            labels: ['Great', 'Good', 'Okay', 'Bad', 'Terrible']
        }
    },
    
    stress_level: {
        type: 'metric_input',
        description: 'Stress level tracker (1-10 scale)',
        options: {
            min: 1,
            max: 10,
            step: 1,
            label: 'Stress Level'
        }
    },
    
    focus_score: {
        type: 'metric_input',
        description: 'Focus/concentration score (1-10 scale)',
        options: {
            min: 1,
            max: 10,
            step: 1,
            label: 'Focus Score'
        }
    },
    
    water_intake: {
        type: 'metric_input',
        description: 'Water intake tracker in ounces',
        options: {
            min: 0,
            max: 200,
            step: 8,
            label: 'Water (oz)',
            icon: '💧'
        }
    }
};

function getTemplate(templateName) {
    return componentTemplates[templateName] || null;
}

module.exports = {
    generateComponent,
    getTemplate,
    componentTemplates
};
