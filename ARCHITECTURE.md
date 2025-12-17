# CHERRY v11.0 - SELF-EVOLVING AI ARCHITECTURE

## SYSTEM OVERVIEW

CHERRY v11 can modify its own structure through:
1. Dynamic component injection
2. Database schema evolution
3. Conversational interface

**CORE PRINCIPLE:** Safe, reversible modifications with full backup system

---

## COMPONENT SYSTEM

### Component Storage
```
/mnt/user-data/components/
  - custom/           (user-requested components)
  - templates/        (component templates)
  - active.json       (list of active components)
```

### Component Lifecycle
1. **Request:** "Add mood tracking"
2. **Generate:** CHERRY writes React component
3. **Save:** Component stored in `/components/custom/`
4. **Register:** Added to `active.json`
5. **Load:** UI dynamically imports on next render
6. **Deploy:** Component appears in interface

### Component Template
```javascript
// MoodTracker.jsx
export default function MoodTracker({ onSave }) {
    const [mood, setMood] = useState(null);
    
    const moods = [
        { emoji: '😊', value: 5, label: 'Great' },
        { emoji: '🙂', value: 4, label: 'Good' },
        { emoji: '😐', value: 3, label: 'Okay' },
        { emoji: '😕', value: 2, label: 'Bad' },
        { emoji: '😢', value: 1, label: 'Terrible' }
    ];
    
    return (
        <div className="metric-card">
            <div className="metric-label">Mood</div>
            <div style={{display: 'flex', gap: '10px'}}>
                {moods.map(m => (
                    <button 
                        key={m.value}
                        onClick={() => {
                            setMood(m.value);
                            onSave('mood', m.value);
                        }}
                        className={mood === m.value ? 'active' : ''}
                    >
                        {m.emoji}
                    </button>
                ))}
            </div>
        </div>
    );
}
```

---

## SCHEMA EVOLUTION

### Field Addition
```javascript
{
    action: 'add_field',
    table: 'metrics',
    field: 'mood',
    type: 'TEXT',
    label: 'Mood',
    input_type: 'emoji_select',
    options: ['😊', '🙂', '😐', '😕', '😢']
}
```

### Migration Process
1. **Backup:** Export cherry.db
2. **Validate:** Check field doesn't exist
3. **Execute:** `ALTER TABLE metrics ADD COLUMN mood TEXT`
4. **Update UI:** Add input to Quick Entry
5. **Update Extraction:** Add mood detection
6. **Log:** Record migration in migrations.json

### Field Removal (Soft Delete)
```javascript
{
    action: 'remove_field',
    table: 'metrics',
    field: 'steps',
    soft_delete: true  // Keeps data, hides from UI
}
```

---

## MODIFICATION TRIGGERS

### Conversational Commands
```
"Add mood tracking"
"Track my stress level"
"Remove steps, I don't use it"
"Add a chart showing protein sources"
"Delete the water tracker"
"Create a focus score metric"
```

### Detection Patterns
```javascript
const modificationTriggers = [
    { pattern: /add\s+(.+?)\s+tracking/i, action: 'add_metric' },
    { pattern: /track\s+(?:my\s+)?(.+)/i, action: 'add_metric' },
    { pattern: /remove\s+(.+?)\s+tracker?/i, action: 'remove_metric' },
    { pattern: /delete\s+(?:the\s+)?(.+?)\s+(?:tracker|metric)/i, action: 'remove_metric' },
    { pattern: /add\s+(?:a\s+)?chart\s+(?:for|showing)\s+(.+)/i, action: 'add_chart' },
    { pattern: /create\s+(?:a\s+)?(.+?)\s+(?:metric|tracker)/i, action: 'add_metric' }
];
```

---

## AI COMPONENT GENERATOR

### Generation Prompt Template
```
You are CHERRY's component generator. Create a React component for: {REQUEST}

USER CONTEXT:
- Timothy, 37, Marine vet
- Prefers direct, minimal UI
- Dark woodsy theme: #000000 background, forest greens
- Mobile-first responsive design

REQUIREMENTS:
1. Functional component using hooks
2. Styled inline with theme colors
3. onSave callback for data persistence
4. Input validation
5. Mobile-optimized touch targets

THEME COLORS:
- Background: #000000
- Cards: rgba(26, 47, 26, 0.5)
- Primary: #4A9E4A (forest green)
- Secondary: #D4AF37 (gold)
- Text: #F5DEB3 (wheat)
- Accent: #9ACD32 (spring green)

Generate ONLY the component code, no explanation.
```

---

## SAFETY MECHANISMS

### Backup System
```javascript
// Before any modification
await createBackup({
    database: 'cherry.db',
    components: '/mnt/user-data/components/',
    timestamp: Date.now()
});

// Stored in: /mnt/user-data/backups/
```

### Validation
```javascript
// Before schema change
validateSchemaChange({
    table: 'metrics',
    field: 'mood',
    checks: [
        'field_doesnt_exist',
        'valid_sql_type',
        'no_reserved_words',
        'safe_column_name'
    ]
});

// Before component load
validateComponent({
    code: componentCode,
    checks: [
        'valid_jsx_syntax',
        'no_dangerous_imports',
        'no_eval_or_function_constructor',
        'uses_approved_libraries'
    ]
});
```

### Rollback
```javascript
// User says: "CHERRY, undo that change"
rollbackLastModification({
    restore_database: true,
    remove_component: true,
    update_active_components: true
});
```

---

## FILE STRUCTURE

```
cherry-v11/
├── server.js                    (core backend)
├── public/
│   └── cherry.html              (core UI - never modified)
├── /mnt/user-data/
│   ├── components/
│   │   ├── custom/              (user-generated components)
│   │   │   ├── MoodTracker.jsx
│   │   │   ├── StressLevel.jsx
│   │   │   └── ProteinChart.jsx
│   │   ├── templates/           (component templates)
│   │   └── active.json          (active component registry)
│   ├── backups/
│   │   ├── 2025-12-15_1234/     (timestamped backups)
│   │   │   ├── cherry.db
│   │   │   └── components/
│   ├── migrations/
│   │   ├── 001_add_mood.sql
│   │   ├── 002_add_stress.sql
│   │   └── migrations.json      (migration log)
│   └── outputs/                 (generated files)
└── cherry.db                    (SQLite database)
```

---

## MODIFICATION WORKFLOW

### Example: Add Mood Tracking

**Step 1: User Request**
```
You: "CHERRY, add mood tracking with emoji buttons"
```

**Step 2: CHERRY Analysis**
```javascript
{
    type: 'add_metric',
    metric: 'mood',
    ui_type: 'emoji_select',
    options: ['😊', '🙂', '😐', '😕', '😢'],
    requires_database: true,
    requires_component: true
}
```

**Step 3: Backup**
```javascript
✓ Created backup: /mnt/user-data/backups/2025-12-15_1234/
```

**Step 4: Database Migration**
```sql
ALTER TABLE metrics ADD COLUMN mood TEXT;
```

**Step 5: Component Generation**
```javascript
✓ Generated: /mnt/user-data/components/custom/MoodTracker.jsx
✓ Registered in active.json
```

**Step 6: UI Integration**
```javascript
✓ Component loaded dynamically
✓ Added to Dashboard
✓ Added to Quick Entry
```

**Step 7: Extraction Logic**
```javascript
✓ Added mood detection patterns
✓ Updated saveMetrics to include mood
```

**Step 8: Confirmation**
```
CHERRY: "✓ Mood tracking added! Rate your mood with emoji buttons.
Currently showing on Dashboard. Say 'mood 😊' or click the emoji."
```

---

## LIMITATIONS (Safety Boundaries)

### ✅ CAN MODIFY:
- Add/remove metric fields
- Create UI components
- Add charts and visualizations
- Modify input forms
- Update extraction logic
- Add API endpoints

### ❌ CANNOT MODIFY:
- Core cherry.html structure
- Core server.js logic
- Database engine settings
- Security configurations
- Authentication systems
- File system permissions

---

## ROLLBACK PROCEDURE

### Automatic Rollback Triggers
```javascript
- Component fails to load
- Database migration error
- Syntax error in generated code
- User says "undo that"
- Server crash after modification
```

### Manual Rollback
```
You: "CHERRY, undo the last change"

CHERRY:
✓ Restored database from backup
✓ Removed MoodTracker component
✓ Reverted active components list
"Mood tracking removed. System restored to previous state."
```

---

## FUTURE ENHANCEMENTS (v12+)

- **Visual Component Editor:** Drag-and-drop UI builder
- **Component Marketplace:** Share components with other users
- **AI-Generated Charts:** "Show me X over time" → instant chart
- **Conditional Logic:** "Track mood only on weekdays"
- **Cross-Component Data:** Components can read each other's data
- **Voice Commands:** "Hey CHERRY, add mood tracking"

---

## SECURITY CONSIDERATIONS

### Component Sandboxing
```javascript
- No access to file system
- No network requests (except approved APIs)
- No eval() or Function() constructor
- Limited to React hooks and approved libraries
- Read-only access to database queries
```

### Schema Validation
```javascript
- SQL injection prevention
- Reserved word checking
- Data type validation
- Foreign key constraint checking
- Prevents table drops (only ALTER/ADD allowed)
```

---

This architecture allows CHERRY to evolve based on your needs while maintaining
safety, reversibility, and data integrity.

**Timothy can shape CHERRY into exactly what he needs, when he needs it.**

Semper Fi 🍒
