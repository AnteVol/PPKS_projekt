const express = require("express");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const http = require("http");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

const db = new sqlite3.Database("./database.db");

let clients = new Set();

wss.on("connection", (ws) => {
  console.log("Nova WebSocket konekcija");
  clients.add(ws);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Primljena poruka:", {
        type: data.type,
        class: data.predicted_class,
        confidence: data.confidence,
      });

      if (data.type === "prediction") {
        await handlePrediction(data);
        broadcastToClients(data);
      }
    } catch (error) {
      console.error("Greška pri obradi poruke:", error);
      ws.send(JSON.stringify({ error: "Neispravna poruka" }));
    }
  });

  ws.on("close", () => {
    console.log("WebSocket konekcija zatvorena");
    clients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket greška:", error);
  });
});

function broadcastToClients(data) {
  const activeClients = Array.from(clients).filter(
    (client) => client.readyState === WebSocket.OPEN
  );
  activeClients.forEach((client) => {
    client.send(JSON.stringify(data));
  });
  if (activeClients.length > 1) {
    console.log(`Poruka poslana ${activeClients.length} klijentima`);
  }
}

async function handlePrediction(predictionData) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM classes WHERE name = ?`,
      [predictionData.predicted_class],
      (err, row) => {
        if (err) {
          console.error("Greška pri dohvaćanju klase:", err);
          reject(err);
          return;
        }
        if (!row) {
          console.error(
            "Klasa nije pronađena:",
            predictionData.predicted_class
          );
          reject(
            new Error(
              `Klasa '${predictionData.predicted_class}' nije pronađena u bazi`
            )
          );
          return;
        }
        const stmt = db.prepare(`
          INSERT INTO predictions (audio_file, predicted_class_id, confidence, processing_time, metadata)
          VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
          [
            predictionData.audio_file,
            row.id,
            predictionData.confidence,
            predictionData.processing_time || null,
            JSON.stringify(predictionData.metadata || {}),
          ],
          function (err) {
            if (err) {
              console.error("Greška pri spremanju predikcije:", err);
              reject(err);
            } else {
              console.log(
                `Predikcija spremljena [ID: ${this.lastID}] ${
                  predictionData.predicted_class
                } (${predictionData.confidence.toFixed(3)})`
              );
              resolve(this.lastID);
            }
          }
        );
        stmt.finalize();
      }
    );
  });
}

// REST API
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: "ESC-50 Ready",
  });
});

app.get("/api/predictions", (req, res) => {
  const query = `
    SELECT
      p.id,
      p.audio_file,
      c.name as predicted_class,
      s.name as superclass,
      p.confidence,
      p.processing_time,
      p.metadata,
      p.created_at
    FROM predictions p
    JOIN classes c ON p.predicted_class_id = c.id
    JOIN superclasses s ON c.superclass_id = s.id
    ORDER BY p.created_at DESC
    LIMIT 1000
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Greška pri dohvaćanju predikcija:", err);
      res.status(500).json({ error: "Greška pri dohvaćanju podataka" });
      return;
    }

    const predictions = rows.map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadata || "{}"),
    }));

    console.log(`Dohvaćeno ${predictions.length} predikcija`);
    res.json(predictions);
  });
});

app.get("/api/stats", (req, res) => {
  const queries = {
    total: "SELECT COUNT(*) as count FROM predictions",
    byClass: `
      SELECT c.name, COUNT(*) as count
      FROM predictions p
      JOIN classes c ON p.predicted_class_id = c.id
      GROUP BY c.name
      ORDER BY count DESC
    `,
    bySuperclass: `
      SELECT s.name, COUNT(*) as count
      FROM predictions p
      JOIN classes c ON p.predicted_class_id = c.id
      JOIN superclasses s ON c.superclass_id = s.id
      GROUP BY s.name
      ORDER BY count DESC
    `,
    recent: `
      SELECT COUNT(*) as count
      FROM predictions
      WHERE created_at >= datetime('now', '-24 hours')
    `,
    avgConfidence: "SELECT AVG(confidence) as avg FROM predictions",
  };

  const stats = {};
  let completed = 0;

  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error(`Greška pri dohvaćanju ${key}:`, err);
      } else {
        stats[key] =
          key === "total" || key === "recent" || key === "avgConfidence"
            ? rows[0]
            : rows;
      }
      completed++;
      if (completed === Object.keys(queries).length) {
        res.json(stats);
      }
    });
  });
});

app.post("/api/predictions", async (req, res) => {
  try {
    const {
      audio_file,
      predicted_class,
      confidence,
      processing_time,
      metadata,
    } = req.body;

    if (!audio_file || !predicted_class || confidence === undefined) {
      return res.status(400).json({ error: "Nedostaju obavezni parametri" });
    }

    const predictionData = {
      audio_file,
      predicted_class,
      confidence,
      processing_time,
      metadata,
      type: "prediction",
    };

    const predictionId = await handlePrediction(predictionData);
    broadcastToClients(predictionData);

    res.json({ id: predictionId, message: "Predikcija uspješno dodana" });
  } catch (error) {
    console.error("Greška pri dodavanju predikcije:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/classes", (req, res) => {
  const query = `
    SELECT c.id, c.name, s.name as superclass, s.id as superclass_id
    FROM classes c
    JOIN superclasses s ON c.superclass_id = s.id
    ORDER BY s.name, c.name
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Greška pri dohvaćanju klasa" });
      return;
    }
    res.json(rows);
  });
});

app.get("/api/esc50-info", (req, res) => {
  const query = `
    SELECT
      s.name as category,
      s.description,
      COUNT(c.id) as class_count,
      GROUP_CONCAT(c.name) as classes
    FROM superclasses s
    LEFT JOIN classes c ON s.id = c.superclass_id
    GROUP BY s.id, s.name
    ORDER BY s.name
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Greška pri dohvaćanju ESC-50 info" });
      return;
    }

    const info = rows.map((row) => ({
      category: row.category,
      description: row.description,
      class_count: row.class_count,
      classes: row.classes ? row.classes.split(",") : [],
    }));

    res.json({
      total_categories: info.length,
      total_classes: info.reduce((sum, cat) => sum + cat.class_count, 0),
      categories: info,
    });
  });
});

const PORT = process.env.PORT || 3001;

function setupDatabase() {
  return new Promise((resolve, reject) => {
    console.log("Baza podataka spremna");
    resolve();
  });
}

setupDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log("\n" + "=".repeat(60));
      console.log(`Server pokrenut na portu ${PORT}`);
      console.log(`WebSocket: ws://localhost:${PORT}`);
      console.log(`REST API: http://localhost:${PORT}/api`);
      console.log(`ESC-50 Info: http://localhost:${PORT}/api/esc50-info`);
      console.log("=".repeat(60));
      console.log("Spreman za ESC-50 predikcije!");
    });
  })
  .catch((error) => {
    console.error("Greška pri setup-u baze:", error);
    process.exit(1);
  });
