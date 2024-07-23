import React, { useEffect, useRef, useState } from "react";

interface PageTXGeneratorProps {
  model?: string;
  task?: string;
  options?: Record<string, any>;
  onResult?: (result: any) => void;
  onError?: (error: string) => void;
  setProcessFunction?: (
    fn: (input: any, processOptions: Record<string, any>) => void
  ) => void;
}

const PageTXGenerator: React.FC<PageTXGeneratorProps> = ({
  model = "Xenova/all-MiniLM-L6-v2",
  task = "feature-extraction",
  options = {},
  onResult,
  onError,
  setProcessFunction,
}) => {
  const [status, setStatus] = useState<string>("");
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    initializeWorker();

    if (setProcessFunction) {
      setProcessFunction(process);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [model, task, options, setProcessFunction]);

  const initializeWorker = () => {
    const workerScript = `
      import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.remoteModelPath = "https://huggingface.co/";

      let pipe;

      async function initializePipeline(task, model, options) {
        pipe = await pipeline(task, model, options);
      }

      self.onmessage = async function(e) {
        if (e.data.type === 'init') {
          self.postMessage({ type: 'status', message: 'Initializing model...' });
          try {
            await initializePipeline(e.data.task, e.data.model, e.data.options);
            self.postMessage({ type: 'status', message: 'Model ready' });
          } catch (error) {
            self.postMessage({ type: 'error', message: error.message });
          }
        } else if (e.data.type === 'process') {
          try {
            const result = await pipe(e.data.input, e.data.options);
            self.postMessage({ type: 'result', data: result });
          } catch (error) {
            self.postMessage({ type: 'error', message: error.message });
          }
        }
      };
    `;

    const blob = new Blob([workerScript], { type: "application/javascript" });
    workerRef.current = new Worker(URL.createObjectURL(blob), {
      type: "module",
    });

    workerRef.current.onmessage = (e: MessageEvent) => {
      if (e.data.type === "status") {
        setStatus(e.data.message);
      } else if (e.data.type === "result") {
        onResult && onResult(e.data.data);
      } else if (e.data.type === "error") {
        setStatus(`Error: ${e.data.message}`);
        onError && onError(e.data.message);
      }
    };

    workerRef.current.postMessage({ type: "init", model, task, options });
  };

  const process = (input: any, processOptions: Record<string, any> = {}) => {
    if (!workerRef.current) {
      throw new Error("Worker not initialized");
    }
    workerRef.current.postMessage({
      type: "process",
      input,
      options: processOptions,
    });
  };

  return (
    <div>
      <div id="status">{status}</div>
    </div>
  );
};

export default PageTXGenerator;
