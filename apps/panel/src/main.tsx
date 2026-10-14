import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { setDefaultOptions } from "date-fns";
import { fr } from "date-fns/locale";
import "./index.css";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/lib/auth";
import { PinDialogProvider } from "@/components/pin-dialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";

setDefaultOptions({ locale: fr, weekStartsOn: 1 });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <PinDialogProvider>
              <App />
            </PinDialogProvider>
          </TooltipProvider>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
