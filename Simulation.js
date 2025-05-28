const WebSocket = require("ws");
const readline = require("readline");

const ESC50_CLASSES = {
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

const ALL_ESC50_CLASSES = Object.values(ESC50_CLASSES).flat();

class ESC50PredictionClient {
  constructor(serverUrl = "ws://localhost:3001") {
    this.serverUrl = serverUrl;
    this.websocket = null;
    this.predictionCount = 0;
  }

  async connect() {
    return new Promise((resolve) => {
      try {
        this.websocket = new WebSocket(this.serverUrl);

        this.websocket.on("open", () => {
          console.log(`✓ Spojen na server: ${this.serverUrl}`);
          resolve(true);
        });

        this.websocket.on("error", (error) => {
          console.log(`✗ Greška pri spajanju: ${error.message}`);
          resolve(false);
        });

        this.websocket.on("close", () => {
          console.log("Konekcija zatvorena");
        });
      } catch (error) {
        console.log(`✗ Greška pri spajanju: ${error.message}`);
        resolve(false);
      }
    });
  }

  async disconnect() {
    if (this.websocket) {
      this.websocket.close();
      console.log("✓ Konekcija prekinuta");
    }
  }

  async sendPrediction(
    audioFile,
    predictedClass,
    confidence,
    processingTime = null,
    metadata = null
  ) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.log("✗ Nema aktivne konekcije!");
      return false;
    }

    let category = null;
    for (const [cat, classes] of Object.entries(ESC50_CLASSES)) {
      if (classes.includes(predictedClass)) {
        category = cat;
        break;
      }
    }

    const predictionData = {
      type: "prediction",
      audio_file: audioFile,
      predicted_class: predictedClass,
      confidence: confidence,
      processing_time: processingTime,
      metadata: {
        dataset: "ESC-50",
        category: category,
        sample_rate: 44100,
        duration: 5.0,
        ...(metadata || {}),
      },
    };

    try {
      const message = JSON.stringify(predictionData);
      this.websocket.send(message);
      this.predictionCount += 1;
      console.log(
        `📤 [${String(this.predictionCount).padStart(
          3,
          "0"
        )}] ${predictedClass} (${confidence.toFixed(3)}) - ${category}`
      );
      return true;
    } catch (error) {
      console.log(`✗ Greška pri slanju: ${error.message}`);
      return false;
    }
  }

  generateRealisticESC50Sample() {
    const predictedClass =
      ALL_ESC50_CLASSES[Math.floor(Math.random() * ALL_ESC50_CLASSES.length)];

    let baseConfidence = Math.random() * (0.95 - 0.65) + 0.65;

    const hardClasses = [
      "insects",
      "crickets",
      "breathing",
      "wind",
      "water_drops",
    ];
    if (hardClasses.includes(predictedClass)) {
      baseConfidence *= Math.random() * (0.95 - 0.8) + 0.8;
    }

    const easyClasses = ["dog", "cat", "rooster", "car_horn", "siren", "train"];
    if (easyClasses.includes(predictedClass)) {
      baseConfidence = Math.max(
        baseConfidence,
        Math.random() * (0.98 - 0.85) + 0.85
      );
    }

    const confidence = Math.min(baseConfidence, 0.99);

    const fold = Math.floor(Math.random() * 5) + 1;
    const classId = ALL_ESC50_CLASSES.indexOf(predictedClass);
    const sampleId = Math.floor(Math.random() * 40) + 1;
    const audioFile = `${fold}-${String(sampleId).padStart(
      6,
      "0"
    )}-${classId}-${predictedClass}.wav`;

    const processingTime = Math.random() * (3.5 - 0.8) + 0.8;

    const metadata = {
      fold: fold,
      class_id: classId,
      original_sample_id: sampleId,
      file_size: Math.floor(Math.random() * (500000 - 400000)) + 400000,
      timestamp: Date.now() / 1000,
      model_version: "ESC-CNN-v2.1",
      preprocessing: "mel_spectrogram",
    };

    return { audioFile, predictedClass, confidence, processingTime, metadata };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateESC50Classification(
  durationMinutes = 5,
  interval = 2.0
) {
  const client = new ESC50PredictionClient();

  if (!(await client.connect())) {
    return;
  }

  console.log(
    `Počinje ESC-50 simulacija (${durationMinutes} min, interval ${interval}s)`
  );
  console.log(`Ukupno klasa: ${ALL_ESC50_CLASSES.length}`);
  console.log("=".repeat(60));

  const startTime = Date.now();
  const endTime = startTime + durationMinutes * 60 * 1000;

  try {
    while (Date.now() < endTime) {
      const {
        audioFile,
        predictedClass,
        confidence,
        processingTime,
        metadata,
      } = client.generateRealisticESC50Sample();

      await client.sendPrediction(
        audioFile,
        predictedClass,
        confidence,
        processingTime,
        metadata
      );

      await sleep(interval * 1000);
    }

    console.log(
      `\n✅ Simulacija završena! Poslano ${client.predictionCount} predikcija`
    );
  } catch (error) {
    console.log(`\n✗ Greška u simulaciji: ${error.message}`);
  } finally {
    await client.disconnect();
  }
}

async function sendCategorySamples() {
  const client = new ESC50PredictionClient();

  if (!(await client.connect())) {
    return;
  }

  console.log("📤 Šaljem uzorke iz svih ESC-50 kategorija...");

  try {
    for (const [category, classes] of Object.entries(ESC50_CLASSES)) {
      console.log(`\n📁 Kategorija: ${category}`);

      for (const className of classes) {
        let {
          audioFile,
          predictedClass,
          confidence,
          processingTime,
          metadata,
        } = client.generateRealisticESC50Sample();

        predictedClass = className;
        metadata.category = category;
        audioFile = audioFile.replace(audioFile.split("-")[3], className);

        await client.sendPrediction(
          audioFile,
          predictedClass,
          confidence,
          processingTime,
          metadata
        );

        await sleep(500);
      }
    }
  } catch (error) {
    console.log(`\n✗ Greška: ${error.message}`);
  } finally {
    await client.disconnect();
  }
}

async function sendRandomBatch(count = 20) {
  const client = new ESC50PredictionClient();

  if (!(await client.connect())) {
    return;
  }

  console.log(`📤 Slanje ${count} random ESC-50 predikcija...`);

  try {
    for (let i = 0; i < count; i++) {
      const {
        audioFile,
        predictedClass,
        confidence,
        processingTime,
        metadata,
      } = client.generateRealisticESC50Sample();

      await client.sendPrediction(
        audioFile,
        predictedClass,
        confidence,
        processingTime,
        metadata
      );

      const pause = Math.random() * (2.0 - 0.5) + 0.5;
      await sleep(pause * 1000);
    }
  } catch (error) {
    console.log(`\n✗ Greška: ${error.message}`);
  } finally {
    await client.disconnect();
  }
}

function showESC50Info() {
  console.log("\n" + "=".repeat(60));
  console.log("ESC-50: Dataset for Environmental Sound Classification");
  console.log("=".repeat(60));
  console.log(`Ukupno klasa: ${ALL_ESC50_CLASSES.length}`);
  console.log(`Kategorija: ${Object.keys(ESC50_CLASSES).length}`);
  console.log();

  for (const [category, classes] of Object.entries(ESC50_CLASSES)) {
    console.log(`📁 ${category} (${classes.length} klasa):`);
    classes.forEach((className, i) => {
      console.log(`   ${String(i + 1).padStart(2, " ")}. ${className}`);
    });
    console.log();
  }
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  const rl = createInterface();

  process.on("SIGINT", () => {
    console.log("\n👋 Program prekinut");
    rl.close();
    process.exit(0);
  });

  while (true) {
    console.log("\n" + "=".repeat(50));
    console.log("ESC-50 WebSocket Client");
    console.log("=".repeat(50));
    console.log("1. Kontinuirana simulacija (5 min)");
    console.log("2. Kratka simulacija (1 min)");
    console.log("3. Po jedan uzorak iz svake kategorije");
    console.log("4. Random batch (20 uzoraka)");
    console.log("5. Prikaži ESC-50 info");
    console.log("6. Prilagođena simulacija");
    console.log("0. zlaz");

    const choice = (await question(rl, "\nOdaberi opciju: ")).trim();

    switch (choice) {
      case "1":
        await simulateESC50Classification(5, 2.0);
        break;
      case "2":
        await simulateESC50Classification(1, 1.0);
        break;
      case "3":
        await sendCategorySamples();
        break;
      case "4":
        await sendRandomBatch(20);
        break;
      case "5":
        showESC50Info();
        break;
      case "6":
        try {
          const durationStr = await question(rl, "Trajanje (minute): ");
          const intervalStr = await question(rl, "Interval (sekunde): ");
          const duration = parseInt(durationStr) || 5;
          const interval = parseFloat(intervalStr) || 2.0;
          await simulateESC50Classification(duration, interval);
        } catch (error) {
          console.log("✗ Neispravni brojevi!");
        }
        break;
      case "0":
        console.log("Izlazim...");
        rl.close();
        return;
      default:
        console.log("Neispravna opcija!");
    }
  }
}

console.log("ESC-50 WebSocket Client");
console.log("Povezuje se s ESC-50 klasama...");

main().catch((error) => {
  console.error("Greška u glavnoj funkciji:", error);
  process.exit(1);
});
