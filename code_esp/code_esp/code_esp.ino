#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiManager.h> 
#include <ArduinoJson.h> 
#include <FS.h>
#include <SPIFFS.h>

// --- CẤU HÌNH PHẦN CỨNG ---
#define BTN_FAULT_CONFIG 13   // Nút 1: Báo lỗi (Nhấn nhanh) / Cấu hình (Nhấn giữ 3s)
#define BTN_PROCESSING   14   // Nút 2: Tiếp nhận (Kỹ thuật viên đã đến)
#define BTN_DONE         12   // Nút 3: Hoàn thành (Sửa xong)

#define LED_RED          27   // Đèn báo lỗi
#define LED_GREEN        26   // Đèn báo bình thường

// --- BIẾN CẤU HÌNH ---
char mqtt_server[40] = "192.168.1.100"; 
char mqtt_port[6] = "1883";
bool shouldSaveConfig = false;

// --- KHAI BÁO ĐỐI TƯỢNG ---
WiFiClient espClient;
PubSubClient client(espClient);
WiFiManager wm;

// --- BIẾN XỬ LÝ NÚT NHẤN ---
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 250;       
const unsigned long configPressDuration = 3000; 
unsigned long buttonHoldTimer = 0;             

// --- FUNCTION PROTOTYPES ---
void setup_wifi();
void readConfig();
void saveConfig();
void startConfigPortal();
void saveConfigCallback();
void reconnectMQTT();
void mqttCallback(char* topic, byte* message, unsigned int length);
void sendEvent(String type, String desc);

// ==============================================================================
//                                  SETUP
// ==============================================================================
void setup() {
  Serial.begin(115200);
  
  // 1. Cấu hình chân IO (3 Nút + 2 Đèn)
  pinMode(BTN_FAULT_CONFIG, INPUT_PULLUP);
  pinMode(BTN_PROCESSING, INPUT_PULLUP); // <--- MỚI
  pinMode(BTN_DONE, INPUT_PULLUP);
  
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);

  // Test đèn khi khởi động
  digitalWrite(LED_RED, HIGH); delay(200); digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, HIGH); delay(200); digitalWrite(LED_GREEN, LOW);

  // 2. Đọc & Cấu hình
  readConfig();
  client.setServer(mqtt_server, atoi(mqtt_port));
  client.setCallback(mqttCallback);

  // 3. Kết nối WiFi
  WiFi.mode(WIFI_STA); 
  if (WiFi.status() != WL_CONNECTED) WiFi.begin();
  
  // Đèn xanh sáng nếu đã có WiFi
  if (WiFi.status() == WL_CONNECTED) digitalWrite(LED_GREEN, HIGH);
}

// ==============================================================================
//                                   LOOP
// ==============================================================================
void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) reconnectMQTT();
    client.loop();
  }

  // --- 1. XỬ LÝ NÚT LỖI / CONFIG (BTN 13) ---
  if (digitalRead(BTN_FAULT_CONFIG) == LOW) { 
    if (buttonHoldTimer == 0) buttonHoldTimer = millis();
    
    // Giữ 3s -> Vào Config
    if (millis() - buttonHoldTimer > configPressDuration) {
      // Nháy đèn báo hiệu
      for(int i=0; i<3; i++) {
        digitalWrite(LED_RED, HIGH); delay(100); digitalWrite(LED_RED, LOW); delay(100);
      }
      startConfigPortal(); 
      buttonHoldTimer = 0; 
    }
  } else { 
    if (buttonHoldTimer != 0) {
      // Nhấn nhanh -> Báo Lỗi
      if ((millis() - buttonHoldTimer < configPressDuration) && (millis() - lastDebounceTime > debounceDelay)) {
        Serial.println(">>> EVENT: FAULT");
        sendEvent("fault", "Nut bao loi tai may");
        lastDebounceTime = millis();
      }
      buttonHoldTimer = 0; 
    }
  }

  // --- 2. XỬ LÝ NÚT TIẾP NHẬN (BTN 14) --- <--- MỚI
  if (digitalRead(BTN_PROCESSING) == LOW) {
    if (millis() - lastDebounceTime > debounceDelay) {
      Serial.println(">>> EVENT: PROCESSING");
      sendEvent("processing", "Ky thuat vien da tiep nhan");
      lastDebounceTime = millis();
    }
  }

  // --- 3. XỬ LÝ NÚT HOÀN THÀNH (BTN 12) ---
  if (digitalRead(BTN_DONE) == LOW) {
    if (millis() - lastDebounceTime > debounceDelay) {
      Serial.println(">>> EVENT: DONE");
      sendEvent("done", "Sua chua hoan tat");
      lastDebounceTime = millis();
    }
  }
}

// ==============================================================================
//                  CÁC HÀM CHỨC NĂNG
// ==============================================================================

void sendEvent(String type, String desc) {
  if (!client.connected()) return;
  String mac = WiFi.macAddress();
  // Gửi sự kiện: fault, processing, hoặc done
  String payload = "{\"mac\": \"" + mac + "\", \"type\": \"" + type + "\", \"description\": \"" + desc + "\"}";
  client.publish("factory/event", payload.c_str());
}

void mqttCallback(char* topic, byte* message, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) msg += (char)message[i];
  Serial.print("Cmd: "); Serial.println(msg);

  // Điều khiển đèn theo lệnh Server
  if (msg == "FAULT") {
    digitalWrite(LED_RED, HIGH); digitalWrite(LED_GREEN, LOW);
  } 
  else if (msg == "PROCESSING") {
    // Trạng thái đang sửa: Có thể cho đèn đỏ nháy hoặc sáng cả 2 (Tùy bạn chọn)
    // Ở đây tôi để sáng ĐỎ (hoặc bạn có thể lắp thêm đèn Vàng vào chân khác)
    digitalWrite(LED_RED, HIGH); digitalWrite(LED_GREEN, LOW); 
  }
  else if (msg == "NORMAL") {
    digitalWrite(LED_RED, LOW); digitalWrite(LED_GREEN, HIGH);
  }
}

void reconnectMQTT() {
  static unsigned long lastAttempt = 0;
  if (millis() - lastAttempt > 5000) {
    lastAttempt = millis();
    String clientId = WiFi.macAddress(); 
    String subTopic = "cmd/" + clientId;

    if (client.connect(clientId.c_str())) {
      Serial.println("MQTT Connected");
      client.publish("factory/register", ("{\"mac\":\"" + clientId + "\"}").c_str());
      client.subscribe(subTopic.c_str());
      
      digitalWrite(LED_GREEN, HIGH); digitalWrite(LED_RED, LOW);
    } else {
      // Nháy đèn đỏ báo mất kết nối MQTT
      digitalWrite(LED_RED, !digitalRead(LED_RED));
    }
  }
}

// --- CÁC HÀM WIFI MANAGER & CONFIG (Giữ nguyên logic cũ) ---
void readConfig() {
  if (SPIFFS.begin(true)) {
    if (SPIFFS.exists("/config.json")) {
      File configFile = SPIFFS.open("/config.json", "r");
      if (configFile) {
        size_t size = configFile.size();
        std::unique_ptr<char[]> buf(new char[size]);
        configFile.readBytes(buf.get(), size);
        DynamicJsonDocument json(1024);
        if (!deserializeJson(json, buf.get())) {
          strcpy(mqtt_server, json["mqtt_server"]);
          strcpy(mqtt_port, json["mqtt_port"]);
        }
        configFile.close();
      }
    }
  }
}

void saveConfigCallback() { shouldSaveConfig = true; }

void saveConfig() {
  DynamicJsonDocument json(1024);
  json["mqtt_server"] = mqtt_server;
  json["mqtt_port"] = mqtt_port;
  File configFile = SPIFFS.open("/config.json", "w");
  if (configFile) {
    serializeJson(json, configFile);
    configFile.close();
  }
}

void startConfigPortal() {
  digitalWrite(LED_RED, HIGH); digitalWrite(LED_GREEN, HIGH); // Báo hiệu mode config
  
  WiFiManagerParameter custom_mqtt_server("server", "IP MQTT Server", mqtt_server, 40);
  WiFiManagerParameter custom_mqtt_port("port", "Port", mqtt_port, 6);

  wm.setSaveConfigCallback(saveConfigCallback);
  wm.addParameter(&custom_mqtt_server);
  wm.addParameter(&custom_mqtt_port);

  String apName = "IOT_DEVICE_" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (!wm.startConfigPortal(apName.c_str(), "unipax2025")) {
    ESP.restart();
  }

  strcpy(mqtt_server, custom_mqtt_server.getValue());
  strcpy(mqtt_port, custom_mqtt_port.getValue());

  if (shouldSaveConfig) saveConfig();
  ESP.restart();
}