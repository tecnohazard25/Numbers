"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import { createSubjectAction, updateSubjectAction } from "@/app/actions/subjects";
import type { SubjectInput, SubjectAddressInput, SubjectContactInput } from "@/app/actions/subjects";
import { verifyVatAction } from "@/app/actions/vies";
import { createTagAction } from "@/app/actions/tags";
import { calculateTaxCode, validateTaxCode } from "@/lib/tax-code";
import { useGooglePlaces } from "@/hooks/use-google-places";
import { useTranslation } from "@/lib/i18n/context";
import type {
  SubjectType,
  ContactType,
  SubjectWithDetails,
  Tag,
} from "@/types/supabase";

const TAG_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

interface AddressFormItem extends SubjectAddressInput {
  _key: string;
}

interface ContactFormItem extends SubjectContactInput {
  _key: string;
}

interface SubjectFormProps {
  initialData?: SubjectWithDetails;
  tags: Tag[];
}

export function SubjectForm({ initialData, tags: initialTags }: SubjectFormProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const isEdit = !!initialData;

  const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
    person: t("subjects.person"),
    company: t("subjects.company"),
    sole_trader: t("subjects.soleTrader"),
    public_administration: t("subjects.publicAdmin"),
  };

  const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
    phone: t("subjects.contactTypes.phone"),
    mobile: t("subjects.contactTypes.mobile"),
    email: t("subjects.contactTypes.email"),
    pec: t("subjects.contactTypes.pec"),
  };

  const ADDRESS_LABELS = [
    t("subjects.addressLabels.residenza"),
    t("subjects.addressLabels.domicilio"),
    t("subjects.addressLabels.sedeLegale"),
    t("subjects.addressLabels.sedeOperativa"),
    t("subjects.addressLabels.altro"),
  ];

  const COUNTRY_LABELS: Record<string, string> = {
    IT: t("subjects.countries.IT"),
    DE: t("subjects.countries.DE"),
    FR: t("subjects.countries.FR"),
    ES: t("subjects.countries.ES"),
    GB: t("subjects.countries.GB"),
    US: t("subjects.countries.US"),
    CH: t("subjects.countries.CH"),
    AT: t("subjects.countries.AT"),
  };

  const GENDER_LABELS: Record<string, string> = {
    M: t("subjects.male"),
    F: t("subjects.female"),
  };

  // Subject type
  const [type, setType] = useState<SubjectType>(initialData?.type ?? "person");

  // Person fields
  const [firstName, setFirstName] = useState(initialData?.first_name ?? "");
  const [lastName, setLastName] = useState(initialData?.last_name ?? "");
  const [birthDate, setBirthDate] = useState(initialData?.birth_date ?? "");
  const [birthPlace, setBirthPlace] = useState(initialData?.birth_place ?? "");
  const [gender, setGender] = useState(initialData?.gender ?? "");

  // Company fields
  const [businessName, setBusinessName] = useState(initialData?.business_name ?? "");

  // Common fields
  const [taxCode, setTaxCode] = useState(initialData?.tax_code ?? "");
  const [taxCodeManual, setTaxCodeManual] = useState(false);
  const [vatNumber, setVatNumber] = useState(initialData?.vat_number ?? "");
  const [vatVerified, setVatVerified] = useState<boolean | null>(null);
  const [vatVerifying, setVatVerifying] = useState(false);
  const [sdiCode, setSdiCode] = useState(initialData?.sdi_code ?? "");
  const [iban, setIban] = useState(initialData?.iban ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  // Addresses
  const [addresses, setAddresses] = useState<AddressFormItem[]>(() => {
    if (initialData?.subject_addresses?.length) {
      return initialData.subject_addresses.map((a) => ({
        _key: crypto.randomUUID(),
        label: a.label ?? "",
        is_primary: a.is_primary,
        country_code: a.country_code ?? "IT",
        street: a.street ?? "",
        zip_code: a.zip_code ?? "",
        city: a.city ?? "",
        province: a.province ?? "",
        region: a.region ?? "",
      }));
    }
    return [];
  });

  // Contacts
  const [contacts, setContacts] = useState<ContactFormItem[]>(() => {
    if (initialData?.subject_contacts?.length) {
      return initialData.subject_contacts.map((c) => ({
        _key: crypto.randomUUID(),
        type: c.type,
        label: c.label ?? "",
        value: c.value,
        is_primary: c.is_primary,
      }));
    }
    return [];
  });

  // Tags
  const [availableTags, setAvailableTags] = useState<Tag[]>(initialTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => {
    if (initialData?.subject_tags?.length) {
      return initialData.subject_tags.map((st) => st.tag_id);
    }
    return [];
  });
  const [tagSearch, setTagSearch] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Google Places
  const { attachAutocomplete, detachAutocomplete, isAvailable: placesAvailable } = useGooglePlaces();
  const streetInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Auto-calculate tax code for persons
  useEffect(() => {
    if (type !== "person" || taxCodeManual) return;
    if (!firstName || !lastName || !birthDate || !birthPlace || !gender) return;

    const timer = setTimeout(async () => {
      const result = await calculateTaxCode({
        firstName,
        lastName,
        birthDate,
        birthPlace,
        gender: gender as "M" | "F",
      });
      if (result) setTaxCode(result);
    }, 500);

    return () => clearTimeout(timer);
  }, [type, firstName, lastName, birthDate, birthPlace, gender, taxCodeManual]);

  // Attach Google Places to Italian address street inputs
  useEffect(() => {
    if (!placesAvailable) return;

    addresses.forEach((addr) => {
      if (addr.country_code === "IT") {
        const input = streetInputRefs.current.get(addr._key);
        if (input) {
          attachAutocomplete(input, addr._key, (result) => {
            setAddresses((prev) =>
              prev.map((a) =>
                a._key === addr._key
                  ? {
                      ...a,
                      street: result.street,
                      zip_code: result.zip_code,
                      city: result.city,
                      province: result.province,
                      region: result.region,
                    }
                  : a
              )
            );
          });
        }
      } else {
        detachAutocomplete(addr._key);
      }
    });
  }, [addresses.map((a) => `${a._key}-${a.country_code}`).join(","), placesAvailable, attachAutocomplete, detachAutocomplete]);

  // VIES verification
  const handleVatBlur = useCallback(async () => {
    if (!vatNumber || vatNumber.length < 8) {
      setVatVerified(null);
      return;
    }
    setVatVerifying(true);
    const result = await verifyVatAction(vatNumber);
    setVatVerified(result.valid);
    if (result.valid && result.name && !businessName) {
      setBusinessName(result.name);
    }
    setVatVerifying(false);
  }, [vatNumber, businessName]);

  // Recalculate tax code
  const handleRecalculateTaxCode = useCallback(async () => {
    if (!firstName || !lastName || !birthDate || !birthPlace || !gender) {
      toast.error(t("subjects.fillFieldsForTaxCode"));
      return;
    }
    const result = await calculateTaxCode({
      firstName,
      lastName,
      birthDate,
      birthPlace,
      gender: gender as "M" | "F",
    });
    if (result) {
      setTaxCode(result);
      setTaxCodeManual(false);
      toast.success(t("subjects.taxCodeRecalculated"));
    } else {
      toast.error(t("subjects.taxCodeCalculationError"));
    }
  }, [firstName, lastName, birthDate, birthPlace, gender, t]);

  // Address helpers
  const addAddress = () => {
    setAddresses((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        label: "",
        is_primary: prev.length === 0,
        country_code: "IT",
        street: "",
        zip_code: "",
        city: "",
        province: "",
        region: "",
      },
    ]);
  };

  const removeAddress = (key: string) => {
    detachAutocomplete(key);
    setAddresses((prev) => prev.filter((a) => a._key !== key));
  };

  const updateAddress = (key: string, field: keyof SubjectAddressInput, value: string | boolean) => {
    setAddresses((prev) =>
      prev.map((a) => {
        if (a._key !== key) {
          if (field === "is_primary" && value === true) {
            return { ...a, is_primary: false };
          }
          return a;
        }
        return { ...a, [field]: value };
      })
    );
  };

  // Contact helpers
  const addContact = () => {
    setContacts((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        type: "mobile" as ContactType,
        label: "",
        value: "",
        is_primary: prev.length === 0,
      },
    ]);
  };

  const removeContact = (key: string) => {
    setContacts((prev) => prev.filter((c) => c._key !== key));
  };

  const updateContact = (key: string, field: keyof SubjectContactInput, value: string | boolean) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c._key !== key) {
          if (field === "is_primary" && value === true) {
            return { ...c, is_primary: false };
          }
          return c;
        }
        return { ...c, [field]: value };
      })
    );
  };

  // Tag helpers
  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const filteredTags = availableTags.filter(
    (tg) =>
      (!tagSearch || tg.name.toLowerCase().includes(tagSearch.toLowerCase())) &&
      !selectedTagIds.includes(tg.id)
  );

  const exactTagMatch = availableTags.some(
    (tg) => tg.name.toLowerCase() === tagSearch.trim().toLowerCase()
  );
  const canCreateTag = tagSearch.trim().length > 0 && !exactTagMatch;

  const handleCreateTag = async () => {
    if (!tagSearch.trim()) return;
    const result = await createTagAction(tagSearch.trim(), newTagColor);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.tag) {
      setAvailableTags((prev) => [...prev, result.tag]);
      setSelectedTagIds((prev) => [...prev, result.tag.id]);
      setTagSearch("");
      setShowTagDropdown(false);
    }
  };

  // Submit
  const handleSubmit = async () => {
    setIsSubmitting(true);

    const data: SubjectInput = {
      type,
      first_name: type === "person" ? firstName : undefined,
      last_name: type === "person" ? lastName : undefined,
      birth_date: type === "person" && birthDate ? birthDate : undefined,
      birth_place: type === "person" ? birthPlace : undefined,
      gender: type === "person" ? gender : undefined,
      business_name: type !== "person" ? businessName : undefined,
      tax_code: taxCode || undefined,
      vat_number: type !== "person" ? vatNumber : undefined,
      sdi_code: type !== "person" ? sdiCode : undefined,
      iban: iban || undefined,
      notes: notes || undefined,
      addresses: addresses.map(({ _key, ...rest }) => rest),
      contacts: contacts
        .filter((c) => c.value.trim())
        .map(({ _key, ...rest }) => rest),
      tag_ids: selectedTagIds,
      new_tags: [],
    };

    const result = isEdit
      ? await updateSubjectAction(initialData!.id, data)
      : await createSubjectAction(data);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(isEdit ? t("subjects.updated") : t("subjects.created"));
      router.push("/subjects");
    }
    setIsSubmitting(false);
  };

  const isPerson = type === "person";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.push("/subjects")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("common.back")}
        </Button>
        <h1 className="text-2xl font-bold">
          {isEdit ? t("subjects.editSubject") : t("subjects.newSubject")}
        </h1>
      </div>

      {/* Section 1: Type */}
      <Card>
        <CardHeader>
          <CardTitle>{t("subjects.subjectType")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(SUBJECT_TYPE_LABELS) as SubjectType[]).map((st) => (
              <Button
                key={st}
                variant={type === st ? "default" : "outline"}
                size="sm"
                className="w-full"
                onClick={() => setType(st)}
              >
                {SUBJECT_TYPE_LABELS[st]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Personal/Company data */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isPerson ? t("subjects.personalData") : t("subjects.companyData")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPerson ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("subjects.firstName")} *</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("subjects.lastName")} *</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="birthDate">{t("subjects.birthDate")}</Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthPlace">{t("subjects.birthPlace")}</Label>
                  <Input
                    id="birthPlace"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="es. ROMA"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("subjects.gender")}</Label>
                  <Select value={gender} onValueChange={(v) => setGender(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("common.search")}>
                        {gender ? GENDER_LABELS[gender] : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t("subjects.male")}</SelectItem>
                      <SelectItem value="F">{t("subjects.female")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxCode">{t("subjects.taxCode")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="taxCode"
                    value={taxCode}
                    onChange={(e) => {
                      setTaxCode(e.target.value.toUpperCase());
                      setTaxCodeManual(true);
                    }}
                    placeholder={t("subjects.autoCalculated")}
                    maxLength={16}
                    className="flex-1 font-mono uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRecalculateTaxCode}
                    title={t("subjects.recalculate")}
                  >
                    <Calculator className="h-4 w-4" />
                  </Button>
                </div>
                {taxCode && (
                  <p className={`text-xs ${validateTaxCode(taxCode) ? "text-green-500" : "text-yellow-500"}`}>
                    {validateTaxCode(taxCode)
                      ? t("subjects.taxCodeValid")
                      : t("subjects.taxCodeInvalid")}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="businessName">{t("subjects.businessName")} *</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vatNumber">{t("subjects.vatNumber")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="vatNumber"
                      value={vatNumber}
                      onChange={(e) => {
                        setVatNumber(e.target.value);
                        setVatVerified(null);
                      }}
                      onBlur={handleVatBlur}
                      placeholder="es. 12345678901"
                      className="flex-1 font-mono"
                    />
                    {vatVerifying && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {vatVerified === true && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    {vatVerified === false && vatNumber && <XCircle className="h-5 w-5 text-red-500" />}
                  </div>
                  {vatVerified === true && (
                    <p className="text-xs text-green-500">{t("subjects.vatVerifiedVies")}</p>
                  )}
                  {vatVerified === false && vatNumber && (
                    <p className="text-xs text-red-500">{t("subjects.vatInvalidVies")}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sdiCode">{t("subjects.sdiCode")}</Label>
                  <Input
                    id="sdiCode"
                    value={sdiCode}
                    onChange={(e) => setSdiCode(e.target.value.toUpperCase())}
                    placeholder="es. 0000000"
                    maxLength={7}
                    className="font-mono uppercase"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxCodeCompany">{t("subjects.taxCode")}</Label>
                <Input
                  id="taxCodeCompany"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value.toUpperCase())}
                  maxLength={16}
                  className="font-mono uppercase"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Common data */}
      <Card>
        <CardHeader>
          <CardTitle>{t("subjects.commonData")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="iban">{t("subjects.iban")}</Label>
            <Input
              id="iban"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="es. IT60X0542811101000000123456"
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t("subjects.notes")}</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="h-auto w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Addresses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("subjects.addresses")}</CardTitle>
          <Button variant="outline" size="sm" onClick={addAddress}>
            <Plus className="h-4 w-4 mr-1" />
            {t("common.add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {addresses.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("subjects.noAddresses")}
            </p>
          )}
          {addresses.map((addr) => (
            <div key={addr._key} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <Select
                    value={addr.label}
                    onValueChange={(v) => updateAddress(addr._key, "label", v ?? "")}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t("subjects.addressLabel")}>
                        {addr.label || null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ADDRESS_LABELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={addr.is_primary}
                      onChange={(e) =>
                        updateAddress(addr._key, "is_primary", e.target.checked)
                      }
                      className="rounded"
                    />
                    {t("common.primary")}
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeAddress(addr._key)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">{t("subjects.country")}</Label>
                  <Select
                    value={addr.country_code}
                    onValueChange={(v) => updateAddress(addr._key, "country_code", v ?? "IT")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {COUNTRY_LABELS[addr.country_code] ?? addr.country_code}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IT">{t("subjects.countries.IT")}</SelectItem>
                      <SelectItem value="DE">{t("subjects.countries.DE")}</SelectItem>
                      <SelectItem value="FR">{t("subjects.countries.FR")}</SelectItem>
                      <SelectItem value="ES">{t("subjects.countries.ES")}</SelectItem>
                      <SelectItem value="GB">{t("subjects.countries.GB")}</SelectItem>
                      <SelectItem value="US">{t("subjects.countries.US")}</SelectItem>
                      <SelectItem value="CH">{t("subjects.countries.CH")}</SelectItem>
                      <SelectItem value="AT">{t("subjects.countries.AT")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-xs">{t("subjects.street")}</Label>
                  <Input
                    ref={(el) => {
                      if (el) streetInputRefs.current.set(addr._key, el);
                    }}
                    value={addr.street}
                    onChange={(e) => updateAddress(addr._key, "street", e.target.value)}
                    placeholder={
                      addr.country_code === "IT"
                        ? "Inizia a digitare per autocompletare..."
                        : "Via e numero civico"
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">{t("subjects.zipCode")}</Label>
                  <Input
                    value={addr.zip_code}
                    onChange={(e) => updateAddress(addr._key, "zip_code", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("subjects.city")}</Label>
                  <Input
                    value={addr.city}
                    onChange={(e) => updateAddress(addr._key, "city", e.target.value)}
                  />
                </div>
                {addr.country_code === "IT" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("subjects.province")}</Label>
                      <Input
                        value={addr.province}
                        onChange={(e) => updateAddress(addr._key, "province", e.target.value)}
                        placeholder="es. RM"
                        maxLength={2}
                        className="uppercase"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("subjects.region")}</Label>
                      <Input
                        value={addr.region}
                        onChange={(e) => updateAddress(addr._key, "region", e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 5: Contacts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("subjects.contacts")}</CardTitle>
          <Button variant="outline" size="sm" onClick={addContact}>
            <Plus className="h-4 w-4 mr-1" />
            {t("common.add")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("subjects.noContacts")}
            </p>
          )}
          {contacts.map((contact) => (
            <div key={contact._key} className="flex items-center gap-2 flex-wrap">
              <Select
                value={contact.type}
                onValueChange={(v) => updateContact(contact._key, "type", v ?? "mobile")}
              >
                <SelectTrigger className="w-32">
                  <SelectValue>
                    {CONTACT_TYPE_LABELS[contact.type]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONTACT_TYPE_LABELS) as ContactType[]).map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {CONTACT_TYPE_LABELS[ct]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={contact.label}
                onChange={(e) => updateContact(contact._key, "label", e.target.value)}
                placeholder={t("subjects.addressLabel")}
                className="w-28"
              />
              <Input
                value={contact.value}
                onChange={(e) => updateContact(contact._key, "value", e.target.value)}
                placeholder={
                  contact.type === "email" || contact.type === "pec"
                    ? "email@esempio.it"
                    : "+39..."
                }
                className="flex-1 min-w-[150px]"
              />
              <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={contact.is_primary}
                  onChange={(e) =>
                    updateContact(contact._key, "is_primary", e.target.checked)
                  }
                  className="rounded"
                />
                {t("common.primary")}
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeContact(contact._key)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 6: Tags */}
      <Card>
        <CardHeader>
          <CardTitle>{t("subjects.tags")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Selected tags */}
          {selectedTagIds.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {selectedTagIds.map((tagId) => {
                const tag = availableTags.find((tg) => tg.id === tagId);
                if (!tag) return null;
                return (
                  <Badge
                    key={tag.id}
                    style={{ backgroundColor: tag.color, color: "#fff" }}
                    className="flex items-center gap-1 cursor-pointer"
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                    <X className="h-3 w-3" />
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Tag search */}
          <div className="relative">
            <Input
              value={tagSearch}
              onChange={(e) => {
                setTagSearch(e.target.value);
                setShowTagDropdown(true);
              }}
              onFocus={() => setShowTagDropdown(true)}
              onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
              placeholder={t("subjects.typeAndEnter")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canCreateTag) {
                    handleCreateTag();
                  } else if (filteredTags.length === 1) {
                    toggleTag(filteredTags[0].id);
                    setTagSearch("");
                    setShowTagDropdown(false);
                  }
                }
              }}
            />
            {showTagDropdown && (filteredTags.length > 0 || canCreateTag) && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md max-h-48 overflow-y-auto">
                {filteredTags.map((tag) => (
                  <button
                    key={tag.id}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggleTag(tag.id);
                      setTagSearch("");
                      setShowTagDropdown(false);
                    }}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                ))}
                {canCreateTag && (
                  <div className="border-t px-3 py-2 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-1">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c}
                            className="w-5 h-5 rounded-full border-2"
                            style={{
                              backgroundColor: c,
                              borderColor: c === newTagColor ? "#fff" : "transparent",
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setNewTagColor(c);
                            }}
                          />
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCreateTag();
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {t("subjects.createTag")} &quot;{tagSearch.trim()}&quot;
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => router.push("/subjects")}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
