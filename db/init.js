const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'elegxos.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS stratopedo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onoma TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stelexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onomateponymo TEXT NOT NULL,
    vathmos TEXT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fantaros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onomateponymo TEXT NOT NULL,
    am TEXT UNIQUE,
    stratopedo_id INTEGER REFERENCES stratopedo(id),
    energos INTEGER DEFAULT 1,
    qr_token TEXT UNIQUE NOT NULL,
    katastasi TEXT DEFAULT 'mesa' CHECK(katastasi IN ('mesa','ekso')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ypiresia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    typos TEXT NOT NULL,
    imerominia DATE NOT NULL,
    ora_enarksis TEXT,
    ora_liksis TEXT,
    stratopedo_id INTEGER REFERENCES stratopedo(id)
);

CREATE TABLE IF NOT EXISTS anathesi_ypiresias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fantaros_id INTEGER REFERENCES fantaros(id),
    ypiresia_id INTEGER REFERENCES ypiresia(id),
    katastasi TEXT DEFAULT 'anatetheimeni'
);

CREATE TABLE IF NOT EXISTS kinisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fantaros_id INTEGER REFERENCES fantaros(id),
    typos TEXT CHECK(typos IN ('eksodos','eisodos')),
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    stelexos_id INTEGER REFERENCES stelexos(id)
);
`);

console.log('Η βάση δεδομένων αρχικοποιήθηκε επιτυχώς.');

module.exports = db;
