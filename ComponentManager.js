// ============ COMPONENT MANAGER - v11.0 ============
// Handles dynamic component creation, loading, and management

const fs = require('fs').promises;
const path = require('path');

const COMPONENTS_DIR = '/mnt/user-data/components/custom';
const TEMPLATES_DIR = '/mnt/user-data/components/templates';
const ACTIVE_COMPONENTS_FILE = '/mnt/user-data/components/active.json';
const BACKUPS_DIR = '/mnt/user-data/backups';

class ComponentManager {
    constructor() {
        this.ensureDirectories();
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(COMPONENTS_DIR, { recursive: true });
            await fs.mkdir(TEMPLATES_DIR, { recursive: true });
            await fs.mkdir(BACKUPS_DIR, { recursive: true });
            
            // Create active.json if doesn't exist
            try {
                await fs.access(ACTIVE_COMPONENTS_FILE);
            } catch {
                await fs.writeFile(ACTIVE_COMPONENTS_FILE, JSON.stringify({
                    version: '11.0.0',
                    components: [],
                    last_modified: null
                }, null, 2));
            }
        } catch (error) {
            console.error('Failed to create directories:', error);
        }
    }

    async getActiveComponents() {
        try {
            const data = await fs.readFile(ACTIVE_COMPONENTS_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return { version: '11.0.0', components: [], last_modified: null };
        }
    }

    async registerComponent(componentInfo) {
        const active = await this.getActiveComponents();
        
        // Check if already registered
        const exists = active.components.find(c => c.name === componentInfo.name);
        if (exists) {
            console.log(`Component ${componentInfo.name} already registered`);
            return false;
        }

        active.components.push({
            ...componentInfo,
            registered_at: new Date().toISOString()
        });
        
        active.last_modified = new Date().toISOString();
        
        await fs.writeFile(ACTIVE_COMPONENTS_FILE, JSON.stringify(active, null, 2));
        console.log(`✓ Registered component: ${componentInfo.name}`);
        return true;
    }

    async unregisterComponent(componentName) {
        const active = await this.getActiveComponents();
        
        const index = active.components.findIndex(c => c.name === componentName);
        if (index === -1) {
            console.log(`Component ${componentName} not found`);
            return false;
        }

        active.components.splice(index, 1);
        active.last_modified = new Date().toISOString();
        
        await fs.writeFile(ACTIVE_COMPONENTS_FILE, JSON.stringify(active, null, 2));
        console.log(`✓ Unregistered component: ${componentName}`);
        return true;
    }

    async saveComponent(name, code, metadata) {
        const filename = `${name}.jsx`;
        const filepath = path.join(COMPONENTS_DIR, filename);
        
        await fs.writeFile(filepath, code, 'utf8');
        console.log(`✓ Saved component: ${filepath}`);
        
        return filepath;
    }

    async loadComponent(name) {
        const filename = `${name}.jsx`;
        const filepath = path.join(COMPONENTS_DIR, filename);
        
        try {
            const code = await fs.readFile(filepath, 'utf8');
            return code;
        } catch (error) {
            console.error(`Failed to load component ${name}:`, error);
            return null;
        }
    }

    async deleteComponent(name) {
        const filename = `${name}.jsx`;
        const filepath = path.join(COMPONENTS_DIR, filename);
        
        try {
            await fs.unlink(filepath);
            await this.unregisterComponent(name);
            console.log(`✓ Deleted component: ${name}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete component ${name}:`, error);
            return false;
        }
    }

    async listComponents() {
        const active = await this.getActiveComponents();
        return active.components;
    }

    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(BACKUPS_DIR, timestamp);
        
        await fs.mkdir(backupDir, { recursive: true });
        
        // Backup database
        try {
            await fs.copyFile('./cherry.db', path.join(backupDir, 'cherry.db'));
            console.log('✓ Backed up database');
        } catch (error) {
            console.error('Failed to backup database:', error);
        }
        
        // Backup components
        try {
            const componentsBackup = path.join(backupDir, 'components');
            await fs.mkdir(componentsBackup, { recursive: true });
            
            const files = await fs.readdir(COMPONENTS_DIR);
            for (const file of files) {
                await fs.copyFile(
                    path.join(COMPONENTS_DIR, file),
                    path.join(componentsBackup, file)
                );
            }
            
            await fs.copyFile(ACTIVE_COMPONENTS_FILE, path.join(backupDir, 'active.json'));
            console.log('✓ Backed up components');
        } catch (error) {
            console.error('Failed to backup components:', error);
        }
        
        return backupDir;
    }

    async restoreBackup(backupDir) {
        try {
            // Restore database
            await fs.copyFile(
                path.join(backupDir, 'cherry.db'),
                './cherry.db'
            );
            
            // Restore components
            const componentsBackup = path.join(backupDir, 'components');
            const files = await fs.readdir(componentsBackup);
            
            for (const file of files) {
                await fs.copyFile(
                    path.join(componentsBackup, file),
                    path.join(COMPONENTS_DIR, file)
                );
            }
            
            await fs.copyFile(
                path.join(backupDir, 'active.json'),
                ACTIVE_COMPONENTS_FILE
            );
            
            console.log(`✓ Restored backup from ${backupDir}`);
            return true;
        } catch (error) {
            console.error('Failed to restore backup:', error);
            return false;
        }
    }
}

module.exports = ComponentManager;
