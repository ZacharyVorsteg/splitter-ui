const WS_URL = "wss://advanced-trade-ws.coinbase.com";
export type PriceMap = Map<string, number>;

let ws: WebSocket | null = null;
export const priceMap: PriceMap = new Map();

export function startPriceWS() {
  if (ws) return;
  ws = new WebSocket(WS_URL);
  
  ws.addEventListener("open", () => {
    ws!.send(JSON.stringify({
      type: "subscribe",
      channel: "ticker",
      product_ids: ["ETH-USD", "MATIC-USD"]
    }));
  });
  
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.channel === "ticker" && msg.events) {
      for (const ev of msg.events) {
        for (const t of (ev.tickers || [])) {
          if (t.product_id && t.price) {
            priceMap.set(t.product_id, Number(t.price));
          }
        }
      }
    }
  });
  
  ws.addEventListener("close", () => { 
    ws = null; 
    setTimeout(startPriceWS, 1500); 
  });
  
  ws.addEventListener("error", () => {
    ws = null;
    setTimeout(startPriceWS, 5000);
  });
}

export const getNativeUsd = (network: "ethereum" | "polygon") =>
  network === "polygon" ? priceMap.get("MATIC-USD") : priceMap.get("ETH-USD");

export const getEthUsd = () => priceMap.get("ETH-USD");
export const getMaticUsd = () => priceMap.get("MATIC-USD");
