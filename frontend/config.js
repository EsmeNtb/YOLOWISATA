// Address of the backend. Leave "" to run with no backend: everything then stays on one device.
// Example: window.YOLO_CONFIG = { api: "https://yolowisata-api.example.com" };
// FastAPI serves its own /config.js with api: location.origin for same-origin API calls.
// For a separately hosted frontend, set api to the backend origin to enable online insights.
// An empty api keeps the on-device insight analyzer as the fallback.
window.YOLO_CONFIG = { api: "" };
