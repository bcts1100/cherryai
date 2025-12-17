#!/bin/bash

# CHERRY v11.3 - Remove Broken Water Intake Component

echo "=========================================="
echo "🍒 CHERRY - Removing Water Intake"
echo "=========================================="
echo ""

# Remove component file
if [ -f "/mnt/user-data/components/custom/WaterIntake.jsx" ]; then
    rm /mnt/user-data/components/custom/WaterIntake.jsx
    echo "✓ Deleted WaterIntake.jsx"
else
    echo "  WaterIntake.jsx not found (already deleted?)"
fi

# Clean up active.json
if [ -f "/mnt/user-data/components/active.json" ]; then
    # Backup first
    cp /mnt/user-data/components/active.json /mnt/user-data/components/active.json.backup
    echo "✓ Backed up active.json"
    
    # Create clean version with no components
    cat > /mnt/user-data/components/active.json << 'EOF'
{
  "version": "11.0.0",
  "components": [],
  "last_modified": null
}
EOF
    echo "✓ Cleaned active.json"
else
    echo "  active.json not found"
fi

# Remove from database
if [ -f "cherry.db" ]; then
    sqlite3 cherry.db "PRAGMA table_info(metrics);" | grep -q "water_intake"
    if [ $? -eq 0 ]; then
        echo "  water_intake column exists in database (preserved)"
    else
        echo "  No water_intake column in database"
    fi
fi

echo ""
echo "=========================================="
echo "✓ CLEANUP COMPLETE"
echo "=========================================="
echo ""
echo "Water Intake component removed."
echo "Restart server to see changes."
echo ""
