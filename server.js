const express = require('express');
const http = require('http');
const path = require('path');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { WebSocketServer } = require('ws');
const db = require('./db/init');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Βοηθητική συνάρτηση: broadcast σε όλους τους συνδεδεμένους clients ---
function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(msg);
    });
}

// ================== ΦΑΝΤΑΡΟΙ ==================

// Δημιουργία νέου φαντάρου + QR code
app.post('/api/fantaroi', async (req, res) => {
    const { onomateponymo, am, stratopedo_id } = req.body;
    if (!onomateponymo) return res.status(400).json({ error: 'Απαιτείται ονοματεπώνυμο' });

    const qr_token = uuidv4();
    const stmt = db.prepare(`
        INSERT INTO fantaros (onomateponymo, am, stratopedo_id, qr_token)
        VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(onomateponymo, am || null, stratopedo_id || null, qr_token);

    const qrDataUrl = await QRCode.toDataURL(qr_token);

    res.json({
        id: Number(info.lastInsertRowid),
        onomateponymo,
        am,
        qr_token,
        qr_image: qrDataUrl
    });
});

// Λίστα όλων των φανταρων με τρέχουσα κατάσταση
app.get('/api/fantaroi', (req, res) => {
    const rows = db.prepare(`
        SELECT f.id, f.onomateponymo, f.am, f.katastasi, s.onoma as stratopedo,
        (SELECT ts FROM kinisi WHERE fantaros_id = f.id AND typos='eksodos' ORDER BY ts DESC LIMIT 1) as teleutaia_eksodos,
        (SELECT ts FROM kinisi WHERE fantaros_id = f.id AND typos='eisodos' ORDER BY ts DESC LIMIT 1) as teleutaia_eisodos
        FROM fantaros f
        LEFT JOIN stratopedo s ON f.stratopedo_id = s.id
        WHERE f.energos = 1
        ORDER BY f.onomateponymo
    `).all();
    res.json(rows);
});

// Ανάκτηση QR εικόνας ενός φαντάρου (για εκτύπωση)
app.get('/api/fantaroi/:id/qr', async (req, res) => {
    const f = db.prepare('SELECT qr_token FROM fantaros WHERE id = ?').get(req.params.id);
    if (!f) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    const qrDataUrl = await QRCode.toDataURL(f.qr_token);
    res.json({ qr_image: qrDataUrl });
});

// ================== SCAN (ΕΙΣΟΔΟΣ/ΕΞΟΔΟΣ) ==================

app.post('/api/scan', (req, res) => {
    const { qr_token, stelexos_id } = req.body;
    if (!qr_token) return res.status(400).json({ error: 'Λείπει το qr_token' });

    const fantaros = db.prepare('SELECT * FROM fantaros WHERE qr_token = ? AND energos = 1').get(qr_token);
    if (!fantaros) return res.status(404).json({ error: 'Ο φαντάρος δεν βρέθηκε' });

    // Toggle κατάστασης
    const neaKatastasi = fantaros.katastasi === 'mesa' ? 'ekso' : 'mesa';
    const typosKinisis = neaKatastasi === 'ekso' ? 'eksodos' : 'eisodos';

    db.prepare('UPDATE fantaros SET katastasi = ? WHERE id = ?').run(neaKatastasi, fantaros.id);
    db.prepare(`
        INSERT INTO kinisi (fantaros_id, typos, stelexos_id)
        VALUES (?, ?, ?)
    `).run(fantaros.id, typosKinisis, stelexos_id || null);

    // Φέρε τυχόν ενεργές υπηρεσίες του φαντάρου για σημερα
    const ypiresies = db.prepare(`
        SELECT y.typos, y.imerominia, y.ora_enarksis, y.ora_liksis
        FROM anathesi_ypiresias a
        JOIN ypiresia y ON a.ypiresia_id = y.id
        WHERE a.fantaros_id = ? AND y.imerominia = date('now')
    `).all(fantaros.id);

    const result = {
        onomateponymo: fantaros.onomateponymo,
        neaKatastasi,
        typosKinisis,
        ypiresies
    };

    broadcast({ type: 'kinisi', ...result, fantaros_id: fantaros.id });

    res.json(result);
});

// ================== ΥΠΗΡΕΣΙΕΣ ==================

app.post('/api/ypiresies', (req, res) => {
    const { typos, imerominia, ora_enarksis, ora_liksis, stratopedo_id, fantaros_ids } = req.body;
    if (!typos || !imerominia) return res.status(400).json({ error: 'Λείπουν στοιχεία' });

    const info = db.prepare(`
        INSERT INTO ypiresia (typos, imerominia, ora_enarksis, ora_liksis, stratopedo_id)
        VALUES (?, ?, ?, ?, ?)
    `).run(typos, imerominia, ora_enarksis || null, ora_liksis || null, stratopedo_id || null);

    const ypiresia_id = Number(info.lastInsertRowid);

    if (Array.isArray(fantaros_ids)) {
        const stmt = db.prepare('INSERT INTO anathesi_ypiresias (fantaros_id, ypiresia_id) VALUES (?, ?)');
        fantaros_ids.forEach(fid => stmt.run(fid, ypiresia_id));
    }

    broadcast({ type: 'nea_ypiresia', ypiresia_id });
    res.json({ id: ypiresia_id });
});

// Οι υπηρεσίες ενός συγκεκριμένου φαντάρου (π.χ. μετά από scan στο κινητό του)
app.get('/api/fantaroi/:id/ypiresies', (req, res) => {
    const rows = db.prepare(`
        SELECT y.id, y.typos, y.imerominia, y.ora_enarksis, y.ora_liksis, a.katastasi
        FROM anathesi_ypiresias a
        JOIN ypiresia y ON a.ypiresia_id = y.id
        WHERE a.fantaros_id = ?
        ORDER BY y.imerominia DESC
    `).all(req.params.id);
    res.json(rows);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ο server τρέχει στο τοπικό δίκτυο: http://<IP-του-υπολογιστή>:${PORT}`);
});
