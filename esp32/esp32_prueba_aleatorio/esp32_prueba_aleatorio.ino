#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ============================================================
// OhmSense - ESP32 BLE Test Device
// ============================================================

#define DEVICE_NAME "OhmSense"

// ============================================================
// UUIDs oficiales OhmSense BLE Protocol v1.0
// ============================================================

#define SERVICE_UUID \
  "7b4f1000-6a5e-4d91-9c2a-8f4e5b3d2101"

#define DATA_UUID \
  "7b4f1001-6a5e-4d91-9c2a-8f4e5b3d2101"

#define COMMAND_UUID \
  "7b4f1002-6a5e-4d91-9c2a-8f4e5b3d2101"

#define STATUS_UUID \
  "7b4f1003-6a5e-4d91-9c2a-8f4e5b3d2101"

// ============================================================
// Estados
// ============================================================

#define STATUS_READY         0x00
#define STATUS_MEASURING     0x01
#define STATUS_RESULT_READY  0x02
#define STATUS_ERROR         0x03

// ============================================================
// Objetos BLE
// ============================================================

BLEServer* pServer = nullptr;

BLECharacteristic* pDataCharacteristic = nullptr;
BLECharacteristic* pCommandCharacteristic = nullptr;
BLECharacteristic* pStatusCharacteristic = nullptr;

// ============================================================
// Estado de conexión
// ============================================================

volatile bool deviceConnected = false;

// ============================================================
// Estado de medición
// ============================================================

volatile bool measurementRequested = false;
volatile bool measurementInProgress = false;

// ============================================================
// Declaración de funciones
// ============================================================

void sendStatus(uint8_t status);
void sendRandomMeasurement();
void printHexPacket(const uint8_t* data, size_t length);

// ============================================================
// Imprimir paquete hexadecimal
// ============================================================

void printHexPacket(
    const uint8_t* data,
    size_t length
)
{
  for (size_t i = 0; i < length; i++)
  {
    if (data[i] < 0x10)
    {
      Serial.print("0");
    }

    Serial.print(data[i], HEX);

    if (i < length - 1)
    {
      Serial.print(" ");
    }
  }

  Serial.println();
}

// ============================================================
// Enviar STATUS
// ============================================================

void sendStatus(uint8_t status)
{
  if (!deviceConnected)
  {
    Serial.println(
        "No se envio STATUS: dispositivo desconectado."
    );

    return;
  }

  pStatusCharacteristic->setValue(
      &status,
      1
  );

  pStatusCharacteristic->notify();

  Serial.print("STATUS enviado: ");

  if (status < 0x10)
  {
    Serial.print("0");
  }

  Serial.print(status, HEX);

  Serial.print(" (");

  switch (status)
  {
    case STATUS_READY:
      Serial.print("READY");
      break;

    case STATUS_MEASURING:
      Serial.print("MEASURING");
      break;

    case STATUS_RESULT_READY:
      Serial.print("RESULT_READY");
      break;

    case STATUS_ERROR:
      Serial.print("ERROR");
      break;

    default:
      Serial.print("UNKNOWN");
      break;
  }

  Serial.println(")");
}

// ============================================================
// Callbacks del servidor
// ============================================================

class ServerCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer* server) override
  {
    deviceConnected = true;

    Serial.println();
    Serial.println("========================================");
    Serial.println("         BLE CLIENT CONNECTED");
    Serial.println("========================================");

    Serial.println(
        "Dispositivo conectado."
    );

    Serial.println(
        "Esperando comando..."
    );

    Serial.println();

    // --------------------------------------------------------
    // READY
    // --------------------------------------------------------

    sendStatus(
        STATUS_READY
    );
  }

  void onDisconnect(BLEServer* server) override
  {
    deviceConnected = false;

    measurementRequested = false;
    measurementInProgress = false;

    Serial.println();
    Serial.println("========================================");
    Serial.println("        BLE CLIENT DISCONNECTED");
    Serial.println("========================================");

    Serial.println(
        "Dispositivo desconectado."
    );

    Serial.println(
        "Reiniciando advertising..."
    );

    delay(100);

    BLEDevice::startAdvertising();

    Serial.println(
        "Esperando nueva conexion..."
    );

    Serial.println();
  }
};

// ============================================================
// Callback para comandos
// ============================================================

class CommandCallbacks : public BLECharacteristicCallbacks
{
  void onWrite(
      BLECharacteristic* characteristic
  ) override
  {
    String value =
        characteristic->getValue();

    // ========================================================
    // Verificar comando
    // ========================================================

    if (value.length() == 0)
    {
      Serial.println(
          "Comando recibido vacio."
      );

      return;
    }

    // ========================================================
    // Mostrar comando recibido
    // ========================================================

    Serial.println();
    Serial.println("========================================");
    Serial.println("          BLE COMMAND RECEIVED");
    Serial.println("========================================");

    Serial.print(
        "Cantidad de bytes: "
    );

    Serial.println(
        value.length()
    );

    Serial.print(
        "Bytes recibidos: "
    );

    for (
        size_t i = 0;
        i < value.length();
        i++
    )
    {
      uint8_t receivedByte =
          (uint8_t)value[i];

      if (receivedByte < 0x10)
      {
        Serial.print("0");
      }

      Serial.print(
          receivedByte,
          HEX
      );

      if (i < value.length() - 1)
      {
        Serial.print(" ");
      }
    }

    Serial.println();

    // ========================================================
    // Primer byte = comando
    // ========================================================

    uint8_t command =
        (uint8_t)value[0];

    Serial.print(
        "Comando: 0x"
    );

    if (command < 0x10)
    {
      Serial.print("0");
    }

    Serial.println(
        command,
        HEX
    );

    Serial.println(
        "========================================"
    );

    // ========================================================
    // 0x01 = MEASURE
    // ========================================================

    if (command == 0x01)
    {
      Serial.println();
      Serial.println(
          ">>> SOLICITUD DE MEDICION RECIBIDA"
      );

      // ------------------------------------------------------
      // Evitar dos mediciones simultáneas
      // ------------------------------------------------------

      if (measurementInProgress)
      {
        Serial.println(
            "Medicion ya en progreso."
        );

        sendStatus(
            STATUS_ERROR
        );

        return;
      }

      // ------------------------------------------------------
      // Marcar medición pendiente
      //
      // La medición real se ejecutará en loop().
      // ------------------------------------------------------

      measurementRequested = true;

      // ------------------------------------------------------
      // STATUS = MEASURING
      // ------------------------------------------------------

      sendStatus(
          STATUS_MEASURING
      );

      Serial.println(
          "Medicion programada."
      );

      Serial.println();
    }

    // ========================================================
    // Comando desconocido
    // ========================================================

    else
    {
      Serial.println(
          "Comando desconocido."
      );

      sendStatus(
          STATUS_ERROR
      );
    }
  }
};

// ============================================================
// Generar y enviar medición aleatoria
// ============================================================

void sendRandomMeasurement()
{
  // ==========================================================
  // Verificar conexión
  // ==========================================================

  if (!deviceConnected)
  {
    Serial.println(
        "No se puede enviar DATA: dispositivo desconectado."
    );

    return;
  }

  // ==========================================================
  // 1. RESISTENCIA
  //
  // 1 mOhm - 100 mOhm
  //
  // 1000 - 100000 uOhm
  // ==========================================================

  uint32_t resistance_uohm =
      random(
          1000,
          100001
      );

  // ==========================================================
  // 2. BATERÍA
  //
  // 60 % - 100 %
  // ==========================================================

  uint8_t battery =
      random(
          60,
          101
      );

  // ==========================================================
  // 3. ESTADO DE CARGA
  //
  // 0 = NO CARGANDO
  // 1 = CARGANDO
  // ==========================================================

  uint8_t charging =
      random(
          0,
          2
      );

  // ==========================================================
  // 4. TIEMPO DE CARGA
  //
  // Solo existe si charging == 1.
  //
  // 1 - 180 minutos.
  // ==========================================================

  uint16_t chargeTime = 0;

  if (charging == 1)
  {
    chargeTime =
        random(
            1,
            181
        );
  }
  else
  {
    chargeTime = 0;
  }

  // ==========================================================
  // 5. CONSTRUIR PAQUETE DE 9 BYTES
  //
  // Byte 0    = versión
  // Bytes 1-4 = resistencia uint32 LE
  // Byte 5    = batería
  // Byte 6    = charging
  // Bytes 7-8 = chargeTime uint16 LE
  // ==========================================================

  uint8_t packet[9];

  // ----------------------------------------------------------
  // Versión
  // ----------------------------------------------------------

  packet[0] = 0x01;

  // ----------------------------------------------------------
  // Resistencia
  // ----------------------------------------------------------

  packet[1] =
      resistance_uohm & 0xFF;

  packet[2] =
      (resistance_uohm >> 8) & 0xFF;

  packet[3] =
      (resistance_uohm >> 16) & 0xFF;

  packet[4] =
      (resistance_uohm >> 24) & 0xFF;

  // ----------------------------------------------------------
  // Batería
  // ----------------------------------------------------------

  packet[5] =
      battery;

  // ----------------------------------------------------------
  // Charging
  // ----------------------------------------------------------

  packet[6] =
      charging;

  // ----------------------------------------------------------
  // Tiempo de carga
  // ----------------------------------------------------------

  packet[7] =
      chargeTime & 0xFF;

  packet[8] =
      (chargeTime >> 8) & 0xFF;

  // ==========================================================
  // INFORMACIÓN POR SERIAL
  // ==========================================================

  Serial.println();
  Serial.println("========================================");
  Serial.println("             BLE DATA SENT");
  Serial.println("========================================");

  Serial.print(
      "Cantidad de bytes: "
  );

  Serial.println(
      sizeof(packet)
  );

  // ----------------------------------------------------------
  // Paquete hexadecimal
  // ----------------------------------------------------------

  Serial.print(
      "DATA HEX: "
  );

  printHexPacket(
      packet,
      sizeof(packet)
  );

  Serial.println();

  // ----------------------------------------------------------
  // Versión
  // ----------------------------------------------------------

  Serial.print(
      "Version: 0x"
  );

  if (packet[0] < 0x10)
  {
    Serial.print("0");
  }

  Serial.println(
      packet[0],
      HEX
  );

  // ----------------------------------------------------------
  // Resistencia
  // ----------------------------------------------------------

  Serial.print(
      "Resistencia: "
  );

  Serial.print(
      resistance_uohm
  );

  Serial.println(
      " uOhm"
  );

  Serial.print(
      "Resistencia: "
  );

  Serial.print(
      resistance_uohm / 1000.0,
      3
  );

  Serial.println(
      " mOhm"
  );

  // ----------------------------------------------------------
  // Batería
  // ----------------------------------------------------------

  Serial.print(
      "Bateria: "
  );

  Serial.print(
      battery
  );

  Serial.println(
      "%"
  );

  // ----------------------------------------------------------
  // Carga
  // ----------------------------------------------------------

  Serial.print(
      "Cargando: "
  );

  if (charging == 1)
  {
    Serial.println(
        "SI"
    );
  }
  else
  {
    Serial.println(
        "NO"
    );
  }

  // ----------------------------------------------------------
  // Tiempo de carga
  // ----------------------------------------------------------

  if (charging == 1)
  {
    Serial.print(
        "Tiempo de carga: "
    );

    Serial.print(
        chargeTime
    );

    Serial.println(
        " minutos"
    );
  }
  else
  {
    Serial.println(
        "Tiempo de carga: NO APLICA"
    );
  }

  Serial.println(
      "========================================"
  );

  // ==========================================================
  // ENVIAR DATA
  // ==========================================================

  if (!deviceConnected)
  {
    Serial.println(
        "Cliente desconectado antes de enviar DATA."
    );

    return;
  }

  Serial.println(
      "Preparando NOTIFY DATA..."
  );

  // ----------------------------------------------------------
  // Cargar paquete en característica
  // ----------------------------------------------------------

  pDataCharacteristic->setValue(
      packet,
      sizeof(packet)
  );

  Serial.println(
      "DATA cargado en la caracteristica."
  );

  // ----------------------------------------------------------
  // Enviar NOTIFY
  // ----------------------------------------------------------

  pDataCharacteristic->notify();

  Serial.println(
      "NOTIFY DATA ejecutado correctamente."
  );

  // ----------------------------------------------------------
  // Pequeña espera para asegurar que el stack BLE
  // procese el notification antes del STATUS siguiente.
  // ----------------------------------------------------------

  delay(100);

  Serial.println(
      "DATA enviado al cliente."
  );

  Serial.println();
}

// ============================================================
// SETUP
// ============================================================

void setup()
{
  // ==========================================================
  // SERIAL
  // ==========================================================

  Serial.begin(
      115200
  );

  delay(1000);

  // ==========================================================
  // SEMILLA ALEATORIA
  // ==========================================================

  randomSeed(
      micros() ^ analogRead(0)
  );

  // ==========================================================
  // CABECERA
  // ==========================================================

  Serial.println();
  Serial.println();

  Serial.println("========================================");
  Serial.println("          OHMSENSE BLE TEST");
  Serial.println("========================================");

  Serial.println(
      "Inicializando BLE..."
  );

  Serial.println();

  // ==========================================================
  // INICIALIZAR BLE
  // ==========================================================

  BLEDevice::init(
      DEVICE_NAME
  );

  // ==========================================================
  // CREAR SERVIDOR
  // ==========================================================

  pServer =
      BLEDevice::createServer();

  pServer->setCallbacks(
      new ServerCallbacks()
  );

  // ==========================================================
  // CREAR SERVICIO
  // ==========================================================

  BLEService* service =
      pServer->createService(
          SERVICE_UUID
      );

  // ==========================================================
  // DATA
  // ==========================================================

  pDataCharacteristic =
      service->createCharacteristic(
          DATA_UUID,
          BLECharacteristic::PROPERTY_READ |
          BLECharacteristic::PROPERTY_NOTIFY
      );

  pDataCharacteristic->addDescriptor(
      new BLE2902()
  );

  // ==========================================================
  // COMMAND
  // ==========================================================

  pCommandCharacteristic =
      service->createCharacteristic(
          COMMAND_UUID,
          BLECharacteristic::PROPERTY_WRITE
      );

  pCommandCharacteristic->setCallbacks(
      new CommandCallbacks()
  );

  // ==========================================================
  // STATUS
  // ==========================================================

  pStatusCharacteristic =
      service->createCharacteristic(
          STATUS_UUID,
          BLECharacteristic::PROPERTY_READ |
          BLECharacteristic::PROPERTY_NOTIFY
      );

  pStatusCharacteristic->addDescriptor(
      new BLE2902()
  );

  // ==========================================================
  // STATUS INICIAL
  // ==========================================================

  uint8_t status =
      STATUS_READY;

  pStatusCharacteristic->setValue(
      &status,
      1
  );

  // ==========================================================
  // INICIAR SERVICIO
  // ==========================================================

  service->start();

  // ==========================================================
  // ADVERTISING
  // ==========================================================

  BLEAdvertising* advertising =
      BLEDevice::getAdvertising();

  advertising->addServiceUUID(
      SERVICE_UUID
  );

  advertising->setScanResponse(
      true
  );

  BLEDevice::startAdvertising();

  // ==========================================================
  // INFORMACIÓN
  // ==========================================================

  Serial.println();
  Serial.println(
      "BLE iniciado correctamente."
  );

  Serial.println();

  Serial.print(
      "Nombre BLE: "
  );

  Serial.println(
      DEVICE_NAME
  );

  Serial.print(
      "Servicio: "
  );

  Serial.println(
      SERVICE_UUID
  );

  Serial.print(
      "DATA: "
  );

  Serial.println(
      DATA_UUID
  );

  Serial.print(
      "COMMAND: "
  );

  Serial.println(
      COMMAND_UUID
  );

  Serial.print(
      "STATUS: "
  );

  Serial.println(
      STATUS_UUID
  );

  Serial.println();

  Serial.println(
      "Estado: READY"
  );

  Serial.println(
      "Esperando conexion..."
  );

  Serial.println();

  Serial.println(
      "========================================"
  );
}

// ============================================================
// LOOP
// ============================================================

void loop()
{
  // ==========================================================
  // Procesar solicitud de medición
  // ==========================================================

  if (
      measurementRequested &&
      !measurementInProgress
  )
  {
    // --------------------------------------------------------
    // Marcar medición en progreso
    // --------------------------------------------------------

    measurementRequested = false;
    measurementInProgress = true;

    Serial.println();
    Serial.println(
        ">>> INICIANDO MEDICION"
    );

    // --------------------------------------------------------
    // Simular tiempo de medición
    //
    // IMPORTANTE:
    // Esto ocurre fuera del callback BLE.
    // --------------------------------------------------------

    delay(300);

    // --------------------------------------------------------
    // Generar y enviar DATA
    // --------------------------------------------------------

    if (deviceConnected)
    {
      sendRandomMeasurement();

      // ------------------------------------------------------
      // RESULT_READY
      // ------------------------------------------------------

      if (deviceConnected)
      {
        delay(50);

        sendStatus(
            STATUS_RESULT_READY
        );

        Serial.println();
        Serial.println(
            ">>> MEDICION COMPLETADA"
        );
      }
    }
    else
    {
      Serial.println(
          "Cliente desconectado durante la medicion."
      );
    }

    // --------------------------------------------------------
    // Liberar estado
    // --------------------------------------------------------

    measurementInProgress = false;

    Serial.println();
  }

  // ==========================================================
  // Pequeña pausa
  // ==========================================================

  delay(10);
}