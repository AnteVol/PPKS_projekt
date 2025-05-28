const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const ESC50_DATA = {
  Animals: [
    "dog",
    "rooster",
    "pig",
    "cow",
    "frog",
    "cat",
    "hen",
    "insects",
    "sheep",
    "crow",
  ],
  "Natural soundscapes & water sounds": [
    "rain",
    "sea_waves",
    "crackling_fire",
    "crickets",
    "chirping_birds",
    "water_drops",
    "wind",
    "pouring_water",
    "toilet_flush",
    "thunderstorm",
  ],
  "Human, non-speech sounds": [
    "crying_baby",
    "sneezing",
    "clapping",
    "breathing",
    "coughing",
    "footsteps",
    "laughing",
    "brushing_teeth",
    "snoring",
    "drinking_sipping",
  ],
  "Interior/domestic sounds": [
    "door_wood_knock",
    "mouse_click",
    "keyboard_typing",
    "door_wood_creaks",
    "can_opening",
    "washing_machine",
    "vacuum_cleaner",
    "clock_alarm",
    "clock_tick",
    "glass_breaking",
  ],
  "Exterior/urban noises": [
    "helicopter",
    "chainsaw",
    "siren",
    "car_horn",
    "engine",
    "train",
    "church_bells",
    "airplane",
    "fireworks",
    "hand_saw",
  ],
};

const db = new sqlite3.Database("./database.db");

async function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `
        CREATE TABLE IF NOT EXISTS superclasses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
        (err) => {
          if (err) {
            console.error("Greška pri kreiranju tablice superclasses:", err);
          } else {
            console.log("✓ Tablica superclasses kreirana/provjerena");
          }
        }
      );
      db.run(
        `
        CREATE TABLE IF NOT EXISTS classes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          superclass_id INTEGER,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (superclass_id) REFERENCES superclasses (id)
        )
      `,
        (err) => {
          if (err) {
            console.error("Greška pri kreiranju tablice classes:", err);
          } else {
            console.log("✓ Tablica classes kreirana/provjerena");
          }
        }
      );
      db.run(
        `
        CREATE TABLE IF NOT EXISTS predictions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          audio_file TEXT NOT NULL,
          predicted_class_id INTEGER,
          confidence REAL NOT NULL,
          processing_time REAL,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (predicted_class_id) REFERENCES classes (id)
        )
      `,
        (err) => {
          if (err) {
            console.error("Greška pri kreiranju tablice predictions:", err);
            reject(err);
          } else {
            console.log("✓ Tablica predictions kreirana/provjerena");
            resolve();
          }
        }
      );
    });
  });
}

async function insertSuperclasses() {
  return new Promise((resolve, reject) => {
    console.log("\n📂 Dodajem ESC-50 kategorije (superclasses)...");
    const superclassNames = Object.keys(ESC50_DATA);
    let inserted = 0;
    let errors = 0;
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO superclasses (name, description)
      VALUES (?, ?)
    `);
    superclassNames.forEach((categoryName, index) => {
      const description = `ESC-50 category containing ${ESC50_DATA[categoryName].length} sound classes`;
      stmt.run([categoryName, description], function (err) {
        if (err) {
          console.error(
            `✗ Greška pri dodavanju kategorije '${categoryName}':`,
            err
          );
          errors++;
        } else if (this.changes > 0) {
          console.log(`✓ Dodana kategorija: ${categoryName}`);
          inserted++;
        } else {
          console.log(`- Kategorija već postoji: ${categoryName}`);
        }
        if (index === superclassNames.length - 1) {
          stmt.finalize();
          console.log(`\n📊 Kategorije: ${inserted} novih, ${errors} grešaka`);
          resolve();
        }
      });
    });
  });
}

async function insertClasses() {
  return new Promise((resolve, reject) => {
    console.log("\n🎵 Dodajem ESC-50 klase...");
    let totalClasses = 0;
    let insertedClasses = 0;
    let errors = 0;
    db.all("SELECT id, name FROM superclasses", [], (err, superclasses) => {
      if (err) {
        reject(err);
        return;
      }
      const superclassMap = {};
      superclasses.forEach((sc) => {
        superclassMap[sc.name] = sc.id;
      });
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO classes (name, superclass_id, description)
        VALUES (?, ?, ?)
      `);
      Object.entries(ESC50_DATA).forEach(([categoryName, classes]) => {
        const superclassId = superclassMap[categoryName];
        if (!superclassId) {
          console.error(
            `✗ Superclass ID nije pronađen za kategoriju: ${categoryName}`
          );
          return;
        }
        classes.forEach((className, classIndex) => {
          totalClasses++;
          const description = `ESC-50 environmental sound class from ${categoryName} category`;
          stmt.run([className, superclassId, description], function (err) {
            if (err) {
              console.error(
                `✗ Greška pri dodavanju klase '${className}':`,
                err
              );
              errors++;
            } else if (this.changes > 0) {
              console.log(`✓ ${categoryName.padEnd(35)} -> ${className}`);
              insertedClasses++;
            } else {
              console.log(
                `- ${categoryName.padEnd(35)} -> ${className} (već postoji)`
              );
            }
            if (insertedClasses + errors >= totalClasses) {
              stmt.finalize();
              console.log(
                `\n📊 Klase: ${insertedClasses} novih, ${errors} grešaka, ${totalClasses} ukupno`
              );
              resolve();
            }
          });
        });
      });
    });
  });
}

async function verifyData() {
  return new Promise((resolve) => {
    console.log("\n🔍 Verificiram podatke...")
    db.get("SELECT COUNT(*) as count FROM superclasses", [], (err, row) => {
      if (err) {
        console.error("Greška pri brojanju superclasses:", err);
      } else {
        console.log(`📂 Ukupno kategorija: ${row.count}`);
      }
    });
    db.get("SELECT COUNT(*) as count FROM classes", [], (err, row) => {
      if (err) {
        console.error("Greška pri brojanju classes:", err);
      } else {
        console.log(`🎵 Ukupno klasa: ${row.count}`);
      }
    });
    db.all(
      `
      SELECT s.name, COUNT(c.id) as class_count
      FROM superclasses s
      LEFT JOIN classes c ON s.id = c.superclass_id
      GROUP BY s.id, s.name
      ORDER BY s.name
    `,
      [],
      (err, rows) => {
        if (err) {
          console.error("Greška pri dohvaćanju statistika:", err);
        } else {
          console.log("\n📊 Klase po kategorijama:");
          rows.forEach((row) => {
            console.log(`   ${row.name.padEnd(40)} ${row.class_count} klasa`);
          });
        }
        resolve();
      }
    );
  });
}

async function showSampleQueries() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 KORISNI SQL UPITI");
  console.log("=".repeat(60));
  console.log(`
-- Dohvati sve klase s kategorijama
SELECT c.name as class_name, s.name as category
FROM classes c
JOIN superclasses s ON c.superclass_id = s.id
ORDER BY s.name, c.name;
-- Dohvati statistike predikcija po kategorijama
SELECT s.name as category, COUNT(p.id) as prediction_count
FROM superclasses s
LEFT JOIN classes c ON s.id = c.superclass_id
LEFT JOIN predictions p ON c.id = p.predicted_class_id
GROUP BY s.id, s.name
ORDER BY prediction_count DESC;
-- Najčešće predviđane klase
SELECT c.name, s.name as category, COUNT(p.id) as count
FROM classes c
JOIN superclasses s ON c.superclass_id = s.id
LEFT JOIN predictions p ON c.id = p.predicted_class_id
GROUP BY c.id, c.name, s.name
ORDER BY count DESC
LIMIT 10;
  `);
}

async function printDatabaseContent() {
  return new Promise((resolve) => {
    console.log("\n" + "=".repeat(60));
    console.log("📊 SADRŽAJ BAZE PODATAKA");
    console.log("=".repeat(60));

    db.all("SELECT * FROM superclasses", [], (err, rows) => {
      if (err) {
        console.error("Greška pri dohvaćanju superclasses:", err);
      } else {
        console.log("\n📂 Superclasses:");
        rows.forEach((row) => {
          console.log(
            `   ID: ${row.id}, Name: ${row.name}, Description: ${row.description}, Created At: ${row.created_at}`
          );
        });
      }
    });

    db.all("SELECT * FROM classes", [], (err, rows) => {
      if (err) {
        console.error("Greška pri dohvaćanju classes:", err);
      } else {
        console.log("\n🎵 Classes:");
        rows.forEach((row) => {
          console.log(
            `   ID: ${row.id}, Name: ${row.name}, Superclass ID: ${row.superclass_id}, Description: ${row.description}, Created At: ${row.created_at}`
          );
        });
      }
    });

    db.all("SELECT * FROM predictions", [], (err, rows) => {
      if (err) {
        console.error("Greška pri dohvaćanju predictions:", err);
      } else {
        console.log("\n📈 Predictions:");
        rows.forEach((row) => {
          console.log(
            `   ID: ${row.id}, Audio File: ${row.audio_file}, Predicted Class ID: ${row.predicted_class_id}, Confidence: ${row.confidence}, Processing Time: ${row.processing_time}, Metadata: ${row.metadata}, Created At: ${row.created_at}`
          );
        });
      }
      resolve();
    });
  });
}

async function setupESC50Database() {
  console.log("🚀 Početak ESC-50 database setup-a...");
  console.log("=".repeat(60));
  try {
    await createTables();
    await insertSuperclasses();
    await insertClasses();
    await verifyData();
    showSampleQueries();
    await printDatabaseContent();
    console.log("\n" + "=".repeat(60));
    console.log("ESC-50 database setup završen uspješno!");ž
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Greška u setup procesu:", error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error("Greška pri zatvaranju baze:", err);
      } else {
        console.log("Baza podataka zatvorena");
      }
    });
  }
}

if (require.main === module) {
  setupESC50Database();
}

module.exports = {
  setupESC50Database,
  ESC50_DATA,
};
