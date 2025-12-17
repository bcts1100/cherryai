// ============ SCHEMA MIGRATION ENGINE - v11.0 ============
// Handles safe database schema evolution

const fs = require('fs').promises;
const path = require('path');

const MIGRATIONS_DIR = '/mnt/user-data/migrations';
const MIGRATIONS_LOG = path.join(MIGRATIONS_DIR, 'migrations.json');

class SchemaMigration {
    constructor(db) {
        this.db = db;
        this.ensureDirectories();
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
            
            // Create migrations log if doesn't exist
            try {
                await fs.access(MIGRATIONS_LOG);
            } catch {
                await fs.writeFile(MIGRATIONS_LOG, JSON.stringify({
                    migrations: [],
                    last_migration: null
                }, null, 2));
            }
        } catch (error) {
            console.error('Failed to create migrations directory:', error);
        }
    }

    async getMigrationsLog() {
        try {
            const data = await fs.readFile(MIGRATIONS_LOG, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return { migrations: [], last_migration: null };
        }
    }

    async logMigration(migration) {
        const log = await this.getMigrationsLog();
        
        log.migrations.push({
            ...migration,
            executed_at: new Date().toISOString()
        });
        
        log.last_migration = migration.id;
        
        await fs.writeFile(MIGRATIONS_LOG, JSON.stringify(log, null, 2));
    }

    validateFieldName(fieldName) {
        // SQL reserved words
        const reserved = ['select', 'insert', 'update', 'delete', 'drop', 'table', 'from', 'where'];
        
        if (reserved.includes(fieldName.toLowerCase())) {
            throw new Error(`"${fieldName}" is a reserved SQL keyword`);
        }

        // Valid field name pattern
        if (!/^[a-z_][a-z0-9_]*$/i.test(fieldName)) {
            throw new Error(`"${fieldName}" is not a valid field name`);
        }

        return true;
    }

    validateDataType(dataType) {
        const validTypes = ['TEXT', 'INTEGER', 'REAL', 'BOOLEAN', 'DATETIME'];
        
        if (!validTypes.includes(dataType.toUpperCase())) {
            throw new Error(`"${dataType}" is not a valid data type`);
        }

        return true;
    }

    async fieldExists(table, field) {
        return new Promise((resolve) => {
            this.db.all(`PRAGMA table_info(${table})`, (err, columns) => {
                if (err) {
                    resolve(false);
                    return;
                }
                
                const exists = columns.some(col => col.name === field);
                resolve(exists);
            });
        });
    }

    async addField(table, field, dataType, defaultValue = null) {
        // Validate inputs
        this.validateFieldName(field);
        this.validateDataType(dataType);

        // Check if field already exists
        const exists = await this.fieldExists(table, field);
        if (exists) {
            console.log(`Field ${field} already exists in ${table}`);
            return { success: false, reason: 'already_exists' };
        }

        // Build SQL
        let sql = `ALTER TABLE ${table} ADD COLUMN ${field} ${dataType}`;
        if (defaultValue !== null) {
            sql += ` DEFAULT ${defaultValue}`;
        }

        // Execute migration
        return new Promise((resolve) => {
            this.db.run(sql, async (err) => {
                if (err) {
                    console.error(`Failed to add field ${field}:`, err);
                    resolve({ success: false, error: err.message });
                    return;
                }

                console.log(`✓ Added field ${field} to ${table}`);

                // Log migration
                await this.logMigration({
                    id: `add_${table}_${field}_${Date.now()}`,
                    type: 'add_field',
                    table,
                    field,
                    dataType,
                    sql
                });

                resolve({ success: true, field, table });
            });
        });
    }

    async removeField(table, field, softDelete = true) {
        // Validate field name
        this.validateFieldName(field);

        // Check if field exists
        const exists = await this.fieldExists(table, field);
        if (!exists) {
            console.log(`Field ${field} doesn't exist in ${table}`);
            return { success: false, reason: 'not_found' };
        }

        if (softDelete) {
            // Soft delete: just mark as removed in log
            // Field stays in database but removed from UI
            console.log(`✓ Soft-deleted field ${field} from ${table} (data preserved)`);
            
            await this.logMigration({
                id: `remove_${table}_${field}_${Date.now()}`,
                type: 'soft_delete_field',
                table,
                field,
                note: 'Field hidden from UI but data preserved'
            });

            return { success: true, soft_delete: true, field, table };
        } else {
            // Hard delete: SQLite doesn't support DROP COLUMN directly
            // Would need to recreate table - risky, so we don't support it
            console.log(`Hard delete not supported for safety reasons`);
            return { success: false, reason: 'hard_delete_not_supported' };
        }
    }

    async getActiveFields(table) {
        // Get all fields except soft-deleted ones
        const log = await this.getMigrationsLog();
        const softDeleted = log.migrations
            .filter(m => m.type === 'soft_delete_field' && m.table === table)
            .map(m => m.field);

        return new Promise((resolve) => {
            this.db.all(`PRAGMA table_info(${table})`, (err, columns) => {
                if (err) {
                    resolve([]);
                    return;
                }

                const active = columns
                    .map(col => col.name)
                    .filter(name => !softDeleted.includes(name));

                resolve(active);
            });
        });
    }

    async listMigrations() {
        const log = await this.getMigrationsLog();
        return log.migrations;
    }
}

module.exports = SchemaMigration;
