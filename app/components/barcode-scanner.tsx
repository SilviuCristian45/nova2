"use client";

import { Text, useLanguage } from "@/app/components/language-provider"
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, ScanLine } from "lucide-react";

interface BarcodeScannerProps {
  onResult: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({
  onResult,
  onClose,
}: BarcodeScannerProps) {
  const { t } = useLanguage()

  const [hasError, setHasError] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Prevenim rularea dublă în React Strict Mode
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode("barcode-reader");

      scannerRef.current
        .start(
          { facingMode: "environment" }, // Folosim camera de pe spate a telefonului
          {
            fps: 10,
            qrbox: { width: 280, height: 150 }, // Dreptunghi specific pentru coduri de bare EAN
            aspectRatio: 1.0,
          },
          (decodedText) => {
            // Succes! Oprim camera și trimitem codul
            if (scannerRef.current) {
              scannerRef.current
                .stop()
                .then(() => {
                  onResult(decodedText);
                })
                .catch(console.error);
            }
          },
          (errorMessage) => {
            // Ignorăm erorile de tip "nu am găsit cod" care se apelează de 10 ori pe secundă
          },
        )
        .catch((err) => {
          setHasError(true);
          console.error(err);
        });
    }

    // Cleanup la închiderea componentei
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[999] bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center animate-in fade-in duration-200">
      {/* HEADER SCANNER */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-zinc-50 dark:from-zinc-950 to-transparent">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-bold text-lg flex items-center gap-2">
          <ScanLine className="size-5 text-orange-700 dark:text-orange-500" />
          <Text ro="Scanează Produsul" en="Scan product" />
        </h2>
        <button
          aria-label={t("Închide scannerul", "Close scanner")}
          onClick={onClose}
          className="size-10 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-full flex items-center justify-center transition-all backdrop-blur-md"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* ZONA DE EROARE (dacă nu e permisă camera) */}
      {hasError && (
        <div className="absolute z-10 bg-red-500/90 text-white p-4 rounded-xl max-w-[80%] text-center shadow-2xl backdrop-blur-md font-bold text-sm">
          {t("Nu am putut accesa camera. Te rugăm să permiți accesul din browser.", "Could not access the camera. Please allow camera access in your browser.")}
        </div>
      )}

      {/* CONTAINERUL CAMEREI */}
      <div className="w-full max-w-xl relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl bg-zinc-100 dark:bg-black">
        <div id="barcode-reader" className="w-full min-h-[400px]"></div>
      </div>

      <p className="mt-8 text-zinc-600 dark:text-zinc-400 font-medium text-sm text-center px-6">
        <Text ro="Încadrează codul de bare în dreptunghiul luminos pentru scanare automată." en="Position the barcode inside the highlighted rectangle to scan automatically." />
      </p>
    </div>
  );
}
