// ============ MODIFICATION DETECTOR - v11.0 ============
// Detects when user wants to modify CHERRY's structure

function detectModificationRequest(userMessage) {
    const lower = userMessage.toLowerCase();
    
    // Modification triggers
    const triggers = [
        // Add metric/tracker
        {
            pattern: /add\s+(?:a\s+)?(.+?)\s+(?:tracker|tracking)/i,
            action: 'add_metric',
            extract: (match) => ({ metric: match[1].trim() })
        },
        {
            pattern: /track\s+(?:my\s+)?(.+)/i,
            action: 'add_metric',
            extract: (match) => ({ metric: match[1].trim() })
        },
        {
            pattern: /(?:can you|could you)\s+track\s+(.+)/i,
            action: 'add_metric',
            extract: (match) => ({ metric: match[1].trim() })
        },
        
        // Remove metric/tracker
        {
            pattern: /remove\s+(?:the\s+)?(.+?)\s+(?:tracker|tracking|metric)/i,
            action: 'remove_metric',
            extract: (match) => ({ metric: match[1].trim() })
        },
        {
            pattern: /delete\s+(?:the\s+)?(.+?)\s+(?:tracker|tracking|metric)/i,
            action: 'remove_metric',
            extract: (match) => ({ metric: match[1].trim() })
        },
        {
            pattern: /stop tracking\s+(.+)/i,
            action: 'remove_metric',
            extract: (match) => ({ metric: match[1].trim() })
        },
        {
            pattern: /i (?:don't|dont) (?:use|need|track)\s+(.+)/i,
            action: 'remove_metric',
            extract: (match) => ({ metric: match[1].trim() })
        },
        
        // Add chart
        {
            pattern: /add\s+(?:a\s+)?chart\s+(?:for|showing|of)\s+(.+)/i,
            action: 'add_chart',
            extract: (match) => ({ chart_description: match[1].trim() })
        },
        {
            pattern: /(?:create|make|show me)\s+(?:a\s+)?chart\s+(?:for|of|showing)\s+(.+)/i,
            action: 'add_chart',
            extract: (match) => ({ chart_description: match[1].trim() })
        },
        
        // Modify UI
        {
            pattern: /move\s+(.+?)\s+to\s+(?:the\s+)?(.+)/i,
            action: 'modify_layout',
            extract: (match) => ({ element: match[1].trim(), location: match[2].trim() })
        },
        
        // Undo
        {
            pattern: /undo\s+(?:that|the last change|last modification)/i,
            action: 'undo',
            extract: () => ({})
        },
        {
            pattern: /rollback|revert|go back/i,
            action: 'undo',
            extract: () => ({})
        }
    ];
    
    // Check each trigger pattern
    for (const trigger of triggers) {
        const match = userMessage.match(trigger.pattern);
        if (match) {
            const details = trigger.extract(match);
            
            // Determine component type from metric name
            let componentType = 'metric_input'; // default
            
            if (details.metric) {
                const metric = details.metric.toLowerCase();
                
                if (metric.includes('mood')) {
                    componentType = 'emoji_select';
                    details.suggested_template = 'mood_tracker';
                } else if (metric.includes('stress')) {
                    componentType = 'metric_input';
                    details.suggested_template = 'stress_level';
                } else if (metric.includes('focus') || metric.includes('concentration')) {
                    componentType = 'metric_input';
                    details.suggested_template = 'focus_score';
                } else if (metric.includes('water')) {
                    componentType = 'metric_input';
                    details.suggested_template = 'water_intake';
                }
            }
            
            console.log(`🔍 Modification detected: ${trigger.action} - ${JSON.stringify(details)}`);
            
            return {
                detected: true,
                action: trigger.action,
                componentType,
                ...details,
                rawMessage: userMessage
            };
        }
    }
    
    return { detected: false };
}

// Extract metric name and convert to valid field name
function metricToFieldName(metricName) {
    return metricName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
        .replace(/^_+|_+$/g, '')       // Remove leading/trailing underscores
        .substring(0, 50);              // Limit length
}

// Convert metric name to component name (PascalCase)
function metricToComponentName(metricName) {
    return metricName
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('')
        .replace(/^[^A-Z]/, c => c.toUpperCase());  // Ensure starts with capital
}

// Determine data type from metric name
function inferDataType(metricName) {
    const lower = metricName.toLowerCase();
    
    if (lower.includes('mood') || lower.includes('stress') || lower.includes('level')) {
        return 'INTEGER';
    }
    
    if (lower.includes('note') || lower.includes('comment') || lower.includes('description')) {
        return 'TEXT';
    }
    
    if (lower.includes('weight') || lower.includes('temp') || lower.includes('rate')) {
        return 'REAL';
    }
    
    if (lower.includes('done') || lower.includes('completed') || lower.includes('check')) {
        return 'BOOLEAN';
    }
    
    return 'INTEGER';  // Default to integer for most metrics
}

module.exports = {
    detectModificationRequest,
    metricToFieldName,
    metricToComponentName,
    inferDataType
};
