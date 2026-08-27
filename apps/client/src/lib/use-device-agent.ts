import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRequest, AgentResponse, DeviceKind, DeviceStatusInfo } from "@ib-pos/shared";

const AGENT_URL = "ws://127.0.0.1:8765";

export type TestState = "idle" | "testing" | "success" | "error";

export function useDeviceAgent() {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<DeviceStatusInfo[]>([]);
  const [testState, setTestState] = useState<Partial<Record<DeviceKind, TestState>>>({});
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(AGENT_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      socket.send(JSON.stringify({ type: "status" } satisfies AgentRequest));
    };

    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as AgentResponse;
      if (message.type === "status") {
        setDevices(message.devices);
      } else if (message.type === "test.result") {
        setTestState((prev) => ({ ...prev, [message.device]: message.success ? "success" : "error" }));
      }
    };

    return () => socket.close();
  }, []);

  const testDevice = useCallback((device: DeviceKind) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    setTestState((prev) => ({ ...prev, [device]: "testing" }));
    socket.send(JSON.stringify({ type: "test", device } satisfies AgentRequest));
  }, []);

  return { connected, devices, testState, testDevice };
}
