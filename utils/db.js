// utils/db.js

const DB_NAME = 'pawview';
const DB_PATH = '_doc/pawview.db';

// Date helpers
const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getNowTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

// Open Database
const openDB = () => {
    return new Promise((resolve, reject) => {
        // #ifdef APP-PLUS
        if (plus.sqlite.isOpenDatabase({ name: DB_NAME, path: DB_PATH })) {
            resolve();
            return;
        }
        plus.sqlite.openDatabase({
            name: DB_NAME,
            path: DB_PATH,
            success: function(e) {
                resolve(e);
            },
            fail: function(e) {
                console.error('Open DB failed: ' + JSON.stringify(e));
                reject(e);
            }
        });
        // #endif
        // #ifndef APP-PLUS
        console.warn('SQLite is only available in APP-PLUS environment');
        resolve(); // Fake resolve for non-app
        // #endif
    });
};

// Execute SQL (INSERT, UPDATE, DELETE, CREATE)
const executeSQL = (sql) => {
    return new Promise((resolve, reject) => {
        // #ifdef APP-PLUS
        plus.sqlite.executeSql({
            name: DB_NAME,
            sql: sql,
            success: function(e) {
                resolve(e);
            },
            fail: function(e) {
                console.error('Execute SQL failed: ' + sql + ' Error: ' + JSON.stringify(e));
                reject(e);
            }
        });
        // #endif
        // #ifndef APP-PLUS
        resolve();
        // #endif
    });
};

// Select SQL (SELECT)
const selectSQL = (sql) => {
    return new Promise((resolve, reject) => {
        // #ifdef APP-PLUS
        plus.sqlite.selectSql({
            name: DB_NAME,
            sql: sql,
            success: function(e) {
                resolve(e);
            },
            fail: function(e) {
                console.error('Select SQL failed: ' + sql + ' Error: ' + JSON.stringify(e));
                reject(e);
            }
        });
        // #endif
        // #ifndef APP-PLUS
        resolve([]);
        // #endif
    });
};

// Seed initial data if table is empty
const seedInitialData = async () => {
    // Use persistent storage as a cross-environment lock
    if (uni.getStorageSync('db_initial_seeded')) return;
    
    try {
        const res = await selectSQL("SELECT count(*) as count FROM tasks");
        if (res && res[0].count === 0) {
            console.log("Seeding initial data...");
            const today = getTodayDate();
            const time = getNowTime();
            const timestamp = Date.now();
            const insertSql = `
                INSERT INTO tasks (name, time, completed, pinned, date, created_at)
                VALUES ('👋 点击我来完成任务', '${time}', 0, 0, '${today}', ${timestamp})
            `;
            await executeSQL(insertSql);
            // Mark as seeded persistently
            uni.setStorageSync('db_initial_seeded', true);
        } else if (res && res[0].count > 0) {
            // Even if we didn't insert, if there is data, mark as seeded
            uni.setStorageSync('db_initial_seeded', true);
        }
    } catch (e) {
        console.error('Seeding error:', e);
    }
};

// Initialize Database
let dbReadyPromise = null;

const initDB = async () => {
    if (dbReadyPromise) return dbReadyPromise;
    
    dbReadyPromise = (async () => {
        try {
            await openDB();
            
            // Create Tasks Table
            const createTableSql = `
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    time TEXT NOT NULL,
                    completed INTEGER DEFAULT 0,
                    pinned INTEGER DEFAULT 0,
                    date TEXT NOT NULL,
                    created_at INTEGER
                )
            `;
            await executeSQL(createTableSql);

            // Migration: Ensure 'pinned' column exists for existing tables
            const tableInfo = await selectSQL("PRAGMA table_info(tasks)");
            const hasPinned = tableInfo.some(col => col.name === 'pinned');
            
            if (!hasPinned) {
                await executeSQL("ALTER TABLE tasks ADD COLUMN pinned INTEGER DEFAULT 0");
            }
            
            await seedInitialData();
        } catch (e) {
            console.error('Init DB Error:', e);
            dbReadyPromise = null; // Allow retry on failure
            throw e;
        }
    })();
    
    return dbReadyPromise;
};

// API Methods

const addTask = async (name, date, time) => {
    await initDB();
    const targetDate = date || getTodayDate();
    const targetTime = time || getNowTime();
    const timestamp = Date.now();
    const sql = `
        INSERT INTO tasks (name, time, completed, pinned, date, created_at)
        VALUES ('${name}', '${targetTime}', 0, 0, '${targetDate}', ${timestamp})
    `;
    await executeSQL(sql);
    return {
        name,
        time: targetTime,
        completed: false,
        pinned: 0,
        date: targetDate
    };
};

const getTasksByDate = async (date) => {
    await initDB();
    // Default to today if no date provided
    const targetDate = date || getTodayDate();
    const sql = `SELECT * FROM tasks WHERE date = '${targetDate}' ORDER BY pinned DESC, created_at DESC`;
    const tasks = await selectSQL(sql);
    return tasks.map(t => ({
        ...t,
        completed: t.completed === 1,
        pinned: t.pinned === 1,
        offsetX: 0 // UI state
    }));
};

const toggleTaskStatus = async (id, currentStatus) => {
    await initDB();
    const newStatus = currentStatus ? 0 : 1;
    const sql = `UPDATE tasks SET completed = ${newStatus} WHERE id = ${id}`;
    await executeSQL(sql);
    return newStatus === 1;
};

const toggleTaskPin = async (id, currentPinned) => {
    await initDB();
    const newPinned = currentPinned ? 0 : 1;
    const sql = `UPDATE tasks SET pinned = ${newPinned} WHERE id = ${id}`;
    await executeSQL(sql);
    return newPinned === 1;
};

const deleteTask = async (id) => {
    await initDB();
    const sql = `DELETE FROM tasks WHERE id = ${id}`;
    await executeSQL(sql);
};

const clearAllData = async () => {
    await initDB();
    const sql = `DELETE FROM tasks`;
    await executeSQL(sql);
    // Reset the persistent lock
    uni.removeStorageSync('db_initial_seeded');
    await seedInitialData();
};

const getProfileStats = async () => {
    await initDB();
    // 1. Total Tasks
    const totalRes = await selectSQL("SELECT count(*) as total FROM tasks");
    const total = totalRes[0].total;

    // 2. Completed Count
    const completedRes = await selectSQL("SELECT count(*) as completed FROM tasks WHERE completed = 1");
    const completedCount = completedRes[0].completed;

    // 3. Completion Rate
    const rate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    // 4. Weekly Completed (Current Week)
    // Calculate start of week (Sunday)
    const now = new Date();
    const day = now.getDay(); // 0-6 (Sun-Sat)
    const diff = now.getDate() - day;
    const startOfWeekDate = new Date(now.setDate(diff));
    const startString = `${startOfWeekDate.getFullYear()}-${(startOfWeekDate.getMonth()+1).toString().padStart(2,'0')}-${startOfWeekDate.getDate().toString().padStart(2,'0')}`;
    
    const weeklyRes = await selectSQL(`SELECT count(*) as weekly FROM tasks WHERE completed = 1 AND date >= '${startString}'`);
    const weekly = weeklyRes[0].weekly;

    // 5. Streak (Consecutive days with at least one completed task ending yesterday or today)
    // Get all dates with completed tasks, distinct, sorted desc
    const datesRes = await selectSQL("SELECT DISTINCT date FROM tasks WHERE completed = 1 ORDER BY date DESC");
    const dates = datesRes.map(d => d.date);
    
    let streak = 0;
    if (dates.length > 0) {
        const todayStr = getTodayDate();
        let currentDate = new Date();
        // Check if today is in list, if not check yesterday.
        // If today has no completed task, but yesterday does, streak is alive?
        // Usually streak implies "up to today" or "up to yesterday".
        // Let's iterate back from today.
        
        // Helper to format date obj to YYYY-MM-DD
        const fmt = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        
        let checkDate = new Date();
        let checkStr = fmt(checkDate);
        
        // If today is not in list, maybe user hasn't done anything yet today. 
        // We shouldn't break streak if yesterday was done.
        if (!dates.includes(checkStr)) {
             checkDate.setDate(checkDate.getDate() - 1);
             checkStr = fmt(checkDate);
        }

        while (dates.includes(checkStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            checkStr = fmt(checkDate);
        }
    }

    // 6. First Use Date (for "Days Used")
    const firstRes = await selectSQL("SELECT created_at FROM tasks ORDER BY created_at ASC LIMIT 1");
    let daysUsed = 1;
    if (firstRes.length > 0) {
        const firstTime = firstRes[0].created_at;
        const diffTime = Math.abs(Date.now() - firstTime);
        daysUsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    }

    // 7. Calendar Data (Activity Map)
    // Map of 'YYYY-MM-DD' -> status ('record', 'today')
    // We already have 'dates' (days with completed tasks).
    // Let's get ALL days with ANY tasks for "Has Record" or just completed?
    // User requirement: "Use Calendar Data". Usually means activity.
    // Let's assume ANY task created on that day means activity, or maybe completed.
    // Let's use "Has Completed Task" for the orange dot.
    
    return {
        total,
        rate: rate + '%',
        weekly,
        streak: streak + '天',
        daysUsed: '已使用 ' + daysUsed + ' 天',
        activityDates: dates // Array of strings 'YYYY-MM-DD'
    };
};

export default {
    initDB,
    addTask,
    getTasksByDate,
    toggleTaskStatus,
    toggleTaskPin,
    deleteTask,
    clearAllData,
    getProfileStats
};
