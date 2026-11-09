"use client";

import { Text, useLanguage } from "@/app/components/language-provider"
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, ScanLine } from "lucide-react";
import { iconButtonClass } from "@/app/components/ui";

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
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background text-foreground">
      {/* HEADER SCANNER */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-background to-transparent p-5">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.4px]">
          <ScanLine className="size-5 text-lime-text" />
          <Text ro="Scanează Produsul" en="Scan product" />
        </h2>
        <button
          aria-label={t("Închide scannerul", "Close scanner")}
          onClick={onClose}
          className={iconButtonClass()}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* ZONA DE EROARE (dacă nu e permisă camera) */}
      {hasError && (
        <div role="alert" className="absolute z-10 max-w-[80%] rounded-md bg-red p-3.5 text-center text-sm font-semibold text-white shadow-2xl">
          {t("Nu am putut accesa camera. Te rugăm să permiți accesul din browser.", "Could not access the camera. Please allow camera access in your browser.")}
        </div>
      )}

      {/* CONTAINERUL CAMEREI */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-lg bg-black">
        <div id="barcode-reader" className="w-full min-h-[400px]"></div>
      </div>

      <p className="mt-8 px-6 text-center text-sm font-medium text-muted">
        <Text ro="Încadrează codul de bare în dreptunghiul luminos pentru scanare automată." en="Position the barcode inside the highlighted rectangle to scan automatically." />
      </p>
    </div>
  );
}
