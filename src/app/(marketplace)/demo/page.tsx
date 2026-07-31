"use client";

import Link from "next/link";
import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ITALIAN_CITIES_BY_PROVINCE, ITALIAN_PROVINCES, type ItalianProvinceCode } from "@/lib/italian-locations";

type DemoFormState = {
  companyName: string;
  vatNumber: string;
  province: ItalianProvinceCode | "";
  city: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  vehicleCount: string;
  brands: string;
  managementSoftware: string;
  interestedPlanCode: "" | "base" | "pro" | "elite";
  notes: string;
  privacyAccepted: boolean;
  websiteTrap: string;
};

const initialValues: DemoFormState = {
  companyName: "",
  vatNumber: "",
  province: "",
  city: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  mobilePhone: "",
  vehicleCount: "",
  brands: "",
  managementSoftware: "",
  interestedPlanCode: "",
  notes: "",
  privacyAccepted: false,
  websiteTrap: "",
};

type StepKey = 1 | 2 | 3;
type ValidationErrors = Partial<Record<keyof DemoFormState | "chamberDocument", string>>;
// interestedPlanCode e' volutamente fuori: e' un'indicazione commerciale
// facoltativa, e chi arriva dalla pagina Demo generica non ha nulla da
// indicare. Obbligarlo farebbe abbandonare il modulo proprio all'ultimo passo.
type RequiredFieldKey = Exclude<keyof DemoFormState, "websiteTrap" | "interestedPlanCode"> | "chamberDocument";

const REQUIRED_FIELDS_ORDER: RequiredFieldKey[] = [
  "companyName",
  "vatNumber",
  "firstName",
  "lastName",
  "email",
  "phone",
  "mobilePhone",
  "city",
  "province",
  "vehicleCount",
  "brands",
  "managementSoftware",
  "notes",
  "chamberDocument",
  "privacyAccepted",
];

const STEP_BY_REQUIRED_FIELD: Record<RequiredFieldKey, StepKey> = {
  companyName: 1,
  vatNumber: 1,
  firstName: 2,
  lastName: 2,
  email: 2,
  phone: 2,
  mobilePhone: 2,
  city: 1,
  province: 1,
  vehicleCount: 3,
  brands: 3,
  managementSoftware: 3,
  notes: 3,
  chamberDocument: 1,
  privacyAccepted: 3,
};

const VEHICLE_COUNT_OPTIONS = [
  { value: "15", label: "Fino a 20 veicoli" },
  { value: "50", label: "Da 21 a 80 veicoli" },
  { value: "120", label: "Da 81 a 200 veicoli" },
  { value: "250", label: "Oltre 200 veicoli" },
];

const STEP_LABELS: Record<StepKey, string> = {
  1: "Concessionaria",
  2: "Referente",
  3: "Attivita",
};

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeVatInput(value: string) {
  return value.replace(/\s+/g, "");
}

function isValidVatNumber(value: string) {
  return /^\d{11}$/.test(normalizeVatInput(value));
}

function isValidPhone(value: string) {
  return /^[+\d\s().-]{8,}$/.test(value.trim());
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function validateDocument(file: File | null) {
  if (!file) {
    return "Carica la visura camerale.";
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = lowerName.endsWith(".pdf") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".png");
  const hasAllowedMime = ALLOWED_DOCUMENT_MIME_TYPES.has(file.type);

  if (!hasAllowedExt && !hasAllowedMime) {
    return "Formato non valido. Carica un file PDF, JPG, JPEG o PNG.";
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return "File troppo grande. Dimensione massima 5 MB.";
  }

  return null;
}

function normalizeInterestedPlan(value: string | null): DemoFormState["interestedPlanCode"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "base" || normalized === "pro" || normalized === "elite" ? normalized : "";
}

function DemoRequestPage() {
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState<StepKey>(1);
  // Precompilato dal piano di provenienza: chi clicca "Richiedi Demo" dalla
  // pagina Elite se lo ritrova gia' selezionato, senza doverlo ripetere.
  const [values, setValues] = useState<DemoFormState>(() => ({
    ...initialValues,
    interestedPlanCode: normalizeInterestedPlan(searchParams.get("piano")),
  }));
  const [chamberDocument, setChamberDocument] = useState<File | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const companyNameRef = useRef<HTMLInputElement | null>(null);
  const vatNumberRef = useRef<HTMLInputElement | null>(null);
  const provinceRef = useRef<HTMLSelectElement | null>(null);
  const cityRef = useRef<HTMLSelectElement | null>(null);
  const chamberDocumentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const lastNameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const mobilePhoneRef = useRef<HTMLInputElement | null>(null);
  const vehicleCountRef = useRef<HTMLSelectElement | null>(null);
  const brandsRef = useRef<HTMLInputElement | null>(null);
  const managementSoftwareRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const privacyAcceptedRef = useRef<HTMLInputElement | null>(null);

  const cityOptions = useMemo(() => {
    if (!values.province) {
      return [];
    }

    return ITALIAN_CITIES_BY_PROVINCE[values.province] ?? [];
  }, [values.province]);

  // Il colore del testo digitato va imposto in linea: globals.css ha una
  // regola NON incapsulata `input, select, textarea { color: rgb(15 23 42) }`
  // per i moduli chiari del pannello, e una regola non incapsulata batte le
  // utility di Tailwind a prescindere dalla specificita'. Con la sola classe
  // il testo resterebbe nero su fondo scuro, cioe' invisibile.
  //
  // colorScheme: "dark" fa disegnare al sistema operativo la tendina aperta e
  // il calendario in scuro, altrimenti si aprirebbero bianchi.
  const fieldTextStyle = { color: "#f8fafc", colorScheme: "dark" } as const;

  const getFieldClassName = (hasError: boolean) =>
    `w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
      hasError
        ? "border-red-400/60 bg-red-500/10 focus:border-red-400 focus:ring-4 focus:ring-red-500/20"
        : "border-white/10 bg-white/[0.04] focus:border-blue-400/50 focus:bg-white/[0.07] focus:ring-4 focus:ring-blue-500/20"
    }`;

  const focusRequiredField = (field: RequiredFieldKey) => {
    switch (field) {
      case "companyName":
        companyNameRef.current?.focus();
        return;
      case "vatNumber":
        vatNumberRef.current?.focus();
        return;
      case "province":
        provinceRef.current?.focus();
        return;
      case "city":
        cityRef.current?.focus();
        return;
      case "chamberDocument":
        chamberDocumentTriggerRef.current?.focus();
        return;
      case "firstName":
        firstNameRef.current?.focus();
        return;
      case "lastName":
        lastNameRef.current?.focus();
        return;
      case "email":
        emailRef.current?.focus();
        return;
      case "phone":
        phoneRef.current?.focus();
        return;
      case "mobilePhone":
        mobilePhoneRef.current?.focus();
        return;
      case "vehicleCount":
        vehicleCountRef.current?.focus();
        return;
      case "brands":
        brandsRef.current?.focus();
        return;
      case "managementSoftware":
        managementSoftwareRef.current?.focus();
        return;
      case "notes":
        notesRef.current?.focus();
        return;
      case "privacyAccepted":
        privacyAcceptedRef.current?.focus();
        return;
    }
  };

  const focusRequiredFieldDeferred = (field: RequiredFieldKey) => {
    window.setTimeout(() => {
      focusRequiredField(field);
    }, 0);
  };

  const clearFieldError = (field: keyof ValidationErrors) => {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleChange =
    (field: keyof DemoFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const nextValue = event.target.value;

      setValues((current) => {
        if (field === "province") {
          return {
            ...current,
            province: nextValue as ItalianProvinceCode,
            city: "",
          };
        }

        if (field === "vatNumber") {
          return {
            ...current,
            vatNumber: normalizeVatInput(nextValue),
          };
        }

        return { ...current, [field]: nextValue };
      });

      clearFieldError(field);
      setIsSubmitted(false);
      setServerMessage(null);
    };

  const handleCheckboxChange =
    (field: keyof DemoFormState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.checked }));

      clearFieldError(field);
      setIsSubmitted(false);
      setServerMessage(null);
    };

  const setDocument = (file: File | null) => {
    setChamberDocument(file);
    const validationError = validateDocument(file);

    if (validationError) {
      setErrors((current) => ({ ...current, chamberDocument: validationError }));
    } else {
      clearFieldError("chamberDocument");
    }

    setIsSubmitted(false);
    setServerMessage(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setDocument(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    setDocument(file);
  };

  const validateStep = (step: StepKey, state: DemoFormState) => {
    const nextErrors: ValidationErrors = {};

    if (step === 1) {
      if (!state.companyName.trim()) {
        nextErrors.companyName = "Inserisci la ragione sociale.";
      }

      if (!isValidVatNumber(state.vatNumber)) {
        nextErrors.vatNumber = "Inserisci una Partita IVA valida (11 cifre).";
      }

      if (!state.province) {
        nextErrors.province = "Seleziona la provincia.";
      }

      if (!state.city.trim()) {
        nextErrors.city = "Inserisci la citta.";
      }

      const documentError = validateDocument(chamberDocument);
      if (documentError) {
        nextErrors.chamberDocument = documentError;
      }
    }

    if (step === 2) {
      if (!state.firstName.trim()) {
        nextErrors.firstName = "Inserisci il nome del referente.";
      }

      if (!state.lastName.trim()) {
        nextErrors.lastName = "Inserisci il cognome del referente.";
      }

      if (!isValidEmail(state.email)) {
        nextErrors.email = "Inserisci una email valida.";
      }

      if (!isValidPhone(state.phone)) {
        nextErrors.phone = "Inserisci un numero di telefono valido.";
      }

      if (!isValidPhone(state.mobilePhone)) {
        nextErrors.mobilePhone = "Inserisci un numero di cellulare valido.";
      }
    }

    if (step === 3) {
      if (!state.vehicleCount.trim()) {
        nextErrors.vehicleCount = "Indica il numero indicativo di veicoli in stock.";
      }

      if (!state.brands.trim()) {
        nextErrors.brands = "Inserisci i marchi trattati.";
      }

      if (!state.managementSoftware.trim()) {
        nextErrors.managementSoftware = "Inserisci il gestionale utilizzato.";
      }

      if (!state.notes.trim()) {
        nextErrors.notes = "Inserisci le note.";
      }

      if (!state.privacyAccepted) {
        nextErrors.privacyAccepted = "Devi accettare l'informativa privacy.";
      }
    }

    return nextErrors;
  };

  const nextStep = () => {
    const currentErrors = validateStep(currentStep, values);
    if (Object.keys(currentErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...currentErrors }));
      const firstInvalidCurrentStep = REQUIRED_FIELDS_ORDER.find(
        (field) => STEP_BY_REQUIRED_FIELD[field] === currentStep && Boolean(currentErrors[field])
      );
      if (firstInvalidCurrentStep) {
        focusRequiredFieldDeferred(firstInvalidCurrentStep);
      }
      return;
    }

    if (currentStep < 3) {
      setCurrentStep((prev) => (prev + 1) as StepKey);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const previousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as StepKey);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const stepOneErrors = validateStep(1, values);
    const stepTwoErrors = validateStep(2, values);
    const stepThreeErrors = validateStep(3, values);
    const allErrors = { ...stepOneErrors, ...stepTwoErrors, ...stepThreeErrors };

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);

      const firstInvalidField = REQUIRED_FIELDS_ORDER.find((field) => Boolean(allErrors[field]));
      if (firstInvalidField) {
        setCurrentStep(STEP_BY_REQUIRED_FIELD[firstInvalidField]);
        focusRequiredFieldDeferred(firstInvalidField);
      }

      return;
    }

    if (!chamberDocument) {
      setErrors((current) => ({ ...current, chamberDocument: "Carica la visura camerale." }));
      setCurrentStep(1);
      focusRequiredFieldDeferred("chamberDocument");
      return;
    }

    setIsSubmitting(true);
    setServerMessage(null);

    const formData = new FormData();
    formData.set("companyName", values.companyName.trim());
    formData.set("vatNumber", normalizeVatInput(values.vatNumber));
    formData.set("province", values.province);
    formData.set("city", values.city.trim());
    formData.set("firstName", values.firstName.trim());
    formData.set("lastName", values.lastName.trim());
    formData.set("email", values.email.trim().toLowerCase());
    formData.set("phone", values.phone.trim());
    formData.set("mobilePhone", values.mobilePhone.trim());
    formData.set("vehicleCount", values.vehicleCount.trim());
    formData.set("brands", values.brands.trim());
    formData.set("managementSoftware", values.managementSoftware.trim());
    formData.set("interestedPlanCode", values.interestedPlanCode);
    formData.set("notes", values.notes.trim());
    formData.set("privacyAccepted", String(values.privacyAccepted));
    formData.set("websiteTrap", values.websiteTrap);
    formData.set("chamberDocument", chamberDocument);

    const response = await fetch("/api/demo/request", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };

    if (!response.ok) {
      setServerMessage(payload.error ?? "Invio richiesta demo non riuscito.");
      setIsSubmitted(false);
      setIsSubmitting(false);
      return;
    }

    setValues(initialValues);
    setChamberDocument(null);
    setErrors({});
    setIsSubmitted(true);
    setServerMessage(payload.message ?? "Richiesta Demo inviata");
    setIsSubmitting(false);
  };

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-5xl overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
        <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-6 py-8 sm:px-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">KeyAuto</p>
          <h1 className="relative mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Richiedi la tua Demo gratuita di 7 giorni</h1>
          <p className="relative mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Compila il modulo in meno di un minuto. Il nostro team verifichera la richiesta e ti contattera per attivare l&apos;accesso Demo.
          </p>
        </div>

        <div className="border-b border-white/10 bg-white/[0.02] px-6 py-5 sm:px-10">
          <ol className="grid gap-3 sm:grid-cols-3" aria-label="Avanzamento richiesta demo">
            {([1, 2, 3] as StepKey[]).map((step) => {
              const isActive = currentStep === step;
              const isCompleted = currentStep > step;

              return (
                <li
                  key={step}
                  className={`rounded-2xl border px-4 py-3 transition ${
                    isActive
                      ? "border-cyan-300/50 bg-cyan-400/10"
                      : isCompleted
                        ? "border-emerald-300/40 bg-emerald-400/10"
                        : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${isActive ? "text-cyan-300" : isCompleted ? "text-emerald-300" : "text-slate-500"}`}>
                    Step {step}
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${isActive ? "text-white" : "text-slate-300"}`}>{STEP_LABELS[step]}</p>
                </li>
              );
            })}
          </ol>
        </div>

        {isSubmitted ? (
          <div className="space-y-6 px-6 py-10 sm:px-10">
            <div className="rounded-3xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-4 text-emerald-200">
              <p className="text-sm font-semibold">Richiesta Demo inviata</p>
              <p className="mt-1 text-sm">Abbiamo ricevuto la tua richiesta. Il nostro team ti contattera per l&apos;attivazione della Demo.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className="inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white">
                Torna alla home
              </Link>
              <Link href="/auto" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
                Vai al catalogo
              </Link>
            </div>
          </div>
        ) : (
          <form className="space-y-6 px-6 py-8 sm:px-10 sm:py-10" onSubmit={handleSubmit} noValidate>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={values.websiteTrap}
              onChange={handleChange("websiteTrap")}
              className="hidden"
              aria-hidden="true"
            />

            {currentStep === 1 ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="companyName" className="mb-2 block text-sm font-medium text-slate-300">Ragione sociale concessionaria *</label>
                    <input ref={companyNameRef} id="companyName" value={values.companyName} onChange={handleChange("companyName")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.companyName))} required />
                    {errors.companyName ? <p className="mt-1 text-xs font-medium text-red-600">{errors.companyName}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="vatNumber" className="mb-2 block text-sm font-medium text-slate-300">Partita IVA *</label>
                    <input ref={vatNumberRef} id="vatNumber" inputMode="numeric" value={values.vatNumber} onChange={handleChange("vatNumber")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.vatNumber))} placeholder="11 cifre" required />
                    {errors.vatNumber ? <p className="mt-1 text-xs font-medium text-red-600">{errors.vatNumber}</p> : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="province" className="mb-2 block text-sm font-medium text-slate-300">Provincia *</label>
                    <select ref={provinceRef} id="province" value={values.province} onChange={handleChange("province")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.province))} required>
                      <option value="">Seleziona provincia</option>
                      {ITALIAN_PROVINCES.map((province) => (
                        <option key={province.code} value={province.code}>{province.name} ({province.code})</option>
                      ))}
                    </select>
                    {errors.province ? <p className="mt-1 text-xs font-medium text-red-600">{errors.province}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="city" className="mb-2 block text-sm font-medium text-slate-300">Citta *</label>
                    <select
                      ref={cityRef}
                      id="city"
                      value={values.city}
                      onChange={handleChange("city")}
                      disabled={!values.province}
                      style={fieldTextStyle}
                      className={`${getFieldClassName(Boolean(errors.city))} disabled:cursor-not-allowed disabled:opacity-60`}
                      required
                    >
                      <option value="">{values.province ? "Seleziona citta" : "Seleziona prima la provincia"}</option>
                      {cityOptions.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    {errors.city ? <p className="mt-1 text-xs font-medium text-red-600">{errors.city}</p> : null}
                  </div>
                </div>

                <div>
                  <p className="mb-2 block text-sm font-medium text-slate-300">Visura camerale *</p>
                  <p className="mb-3 text-xs text-slate-400">Carica una visura camerale aggiornata in PDF o immagine.</p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDropActive(true);
                    }}
                    onDragLeave={() => setIsDropActive(false)}
                    onDrop={handleDrop}
                    className={`rounded-2xl border-2 border-dashed p-4 transition ${
                      errors.chamberDocument
                        ? "border-red-400/60 bg-red-500/10"
                        : isDropActive
                          ? "border-cyan-300/60 bg-cyan-400/10"
                          : "border-white/15 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-slate-300">
                        Trascina qui il file oppure selezionalo manualmente.
                      </div>
                      <button
                        ref={chamberDocumentTriggerRef}
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                      >
                        Seleziona file
                      </button>
                    </div>

                    {chamberDocument ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <p className="text-sm font-medium text-slate-200">{chamberDocument.name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(chamberDocument.size)}</p>
                        <button
                          type="button"
                          onClick={() => setDocument(null)}
                          className="mt-2 text-xs font-semibold text-red-600"
                        >
                          Rimuovi file
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {errors.chamberDocument ? <p className="mt-1 text-xs font-medium text-red-600">{errors.chamberDocument}</p> : null}
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="firstName" className="mb-2 block text-sm font-medium text-slate-300">Nome referente *</label>
                    <input ref={firstNameRef} id="firstName" value={values.firstName} onChange={handleChange("firstName")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.firstName))} required />
                    {errors.firstName ? <p className="mt-1 text-xs font-medium text-red-600">{errors.firstName}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="lastName" className="mb-2 block text-sm font-medium text-slate-300">Cognome referente *</label>
                    <input ref={lastNameRef} id="lastName" value={values.lastName} onChange={handleChange("lastName")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.lastName))} required />
                    {errors.lastName ? <p className="mt-1 text-xs font-medium text-red-600">{errors.lastName}</p> : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-300">Email *</label>
                    <input ref={emailRef} id="email" type="email" value={values.email} onChange={handleChange("email")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.email))} placeholder="nome@concessionaria.it" required />
                    {errors.email ? <p className="mt-1 text-xs font-medium text-red-600">{errors.email}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-300">Telefono fisso *</label>
                    <input ref={phoneRef} id="phone" type="tel" value={values.phone} onChange={handleChange("phone")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.phone))} placeholder="+39 ..." required />
                    {errors.phone ? <p className="mt-1 text-xs font-medium text-red-600">{errors.phone}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="mobilePhone" className="mb-2 block text-sm font-medium text-slate-300">Cellulare *</label>
                    <input ref={mobilePhoneRef} id="mobilePhone" type="tel" value={values.mobilePhone} onChange={handleChange("mobilePhone")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.mobilePhone))} placeholder="+39 ..." required />
                    {errors.mobilePhone ? <p className="mt-1 text-xs font-medium text-red-600">{errors.mobilePhone}</p> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="vehicleCount" className="mb-2 block text-sm font-medium text-slate-300">Numero indicativo di veicoli *</label>
                    <select ref={vehicleCountRef} id="vehicleCount" value={values.vehicleCount} onChange={handleChange("vehicleCount")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.vehicleCount))} required>
                      <option value="">Seleziona una fascia</option>
                      {VEHICLE_COUNT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {errors.vehicleCount ? <p className="mt-1 text-xs font-medium text-red-600">{errors.vehicleCount}</p> : null}
                  </div>
                  <div>
                    <label htmlFor="brands" className="mb-2 block text-sm font-medium text-slate-300">Marchi trattati *</label>
                    <input ref={brandsRef} id="brands" value={values.brands} onChange={handleChange("brands")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.brands))} placeholder="Es. Audi, BMW, Mercedes" required />
                    {errors.brands ? <p className="mt-1 text-xs font-medium text-red-600">{errors.brands}</p> : null}
                  </div>
                </div>

                <div>
                  <label htmlFor="managementSoftware" className="mb-2 block text-sm font-medium text-slate-300">Gestionale utilizzato *</label>
                  <input ref={managementSoftwareRef} id="managementSoftware" value={values.managementSoftware} onChange={handleChange("managementSoftware")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.managementSoftware))} placeholder="Nome software o gestione manuale" required />
                  {errors.managementSoftware ? <p className="mt-1 text-xs font-medium text-red-600">{errors.managementSoftware}</p> : null}
                </div>

                {/* Facoltativo: e' un'indicazione commerciale, non un
                    impegno, e chi arriva dalla pagina Demo generica non ha
                    nessun piano da indicare. */}
                <div>
                  <label htmlFor="interestedPlanCode" className="mb-2 block text-sm font-medium text-slate-300">
                    Piano di interesse
                  </label>
                  <select
                    id="interestedPlanCode"
                    value={values.interestedPlanCode}
                    onChange={handleChange("interestedPlanCode")}
                    style={fieldTextStyle} className={getFieldClassName(false)}
                  >
                    <option value="">Non ho ancora deciso</option>
                    <option value="base">Piano Base</option>
                    <option value="pro">Piano Pro</option>
                    <option value="elite">Piano Elite</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    Ci aiuta a prepararti la demo giusta. Non e vincolante e potrai cambiarlo.
                  </p>
                </div>

                <div>
                  <label htmlFor="notes" className="mb-2 block text-sm font-medium text-slate-300">Note ed esigenze specifiche *</label>
                  <textarea ref={notesRef} id="notes" rows={4} value={values.notes} onChange={handleChange("notes")} style={fieldTextStyle} className={getFieldClassName(Boolean(errors.notes))} placeholder="Informazioni utili per il contatto" required />
                  {errors.notes ? <p className="mt-1 text-xs font-medium text-red-600">{errors.notes}</p> : null}
                </div>

                <div className={`space-y-3 rounded-2xl border p-4 ${errors.privacyAccepted ? "border-red-400/60 bg-red-500/10" : "border-white/10 bg-white/[0.03]"}`}>
                  <label className="flex items-start gap-3 text-sm text-slate-300">
                    <input ref={privacyAcceptedRef} type="checkbox" checked={values.privacyAccepted} onChange={handleCheckboxChange("privacyAccepted")} className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 text-cyan-400 focus:ring-cyan-500/40" required />
                    <span>
                      Dichiaro di aver letto l&apos;
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-cyan-300 underline">informativa privacy</a>
                      {" "}e acconsento al trattamento dei dati per essere ricontattato in merito alla Demo. *
                    </span>
                  </label>
                  {errors.privacyAccepted ? <p className="text-xs font-medium text-red-600">{errors.privacyAccepted}</p> : null}
                </div>
              </div>
            ) : null}

            {serverMessage ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${isSubmitted ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" : "border-red-400/30 bg-red-500/10 text-red-200"}`}>
                {serverMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
              <button type="button" onClick={previousStep} disabled={currentStep === 1 || isSubmitting} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">
                Indietro
              </button>

              <div className="flex flex-wrap gap-3">
                {currentStep < 3 ? (
                  <button type="button" onClick={nextStep} className="inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white focus:outline-none focus:ring-4 focus:ring-cyan-500/20">
                    Avanti
                  </button>
                ) : (
                  <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white focus:outline-none focus:ring-4 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                    {isSubmitting ? "Invio in corso..." : "Invia richiesta Demo"}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

// useSearchParams richiede un confine di Suspense, come gia' fatto per il
// login: senza, la pagina non puo' essere renderizzata sul server.
export default function DemoPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950" />}>
      <DemoRequestPage />
    </Suspense>
  );
}
