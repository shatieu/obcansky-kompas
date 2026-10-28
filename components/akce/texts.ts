import type { AddresseeType } from "@/lib/letters";
import type { PostalTexts } from "@/lib/export/recipients";

/**
 * Typy textů z content/ui.yaml (sekce akce, zakon). Načítá je server (load-texts.ts) a předává klientovi.
 * Po sloučení do ui.yaml stačí v load-texts.ts vrátit `ui.akce` / `ui.zakon`.
 */
export interface AkceTexts {
  meta_title: string;
  kicker: string;
  title: string;
  lead: string;
  source_signature: string;
  source_browser: string;
  loading: string;
  empty_title: string;
  empty_lead: string;
  empty_button: string;
  to_title: string;
  to_lead: string;
  where_title: string;
  region_label: string;
  region_placeholder: string;
  obec_label: string;
  obec_placeholder: string;
  obec_loading: string;
  obec_none: string;
  obec_error: string;
  obec_retry_button: string;
  obec_change_button: string;
  obec_result: string;
  cast_label: string;
  cast_placeholder: string;
  obvod_label: string;
  obvod_placeholder: string;
  obvod_option: string;
  needs_region: string;
  needs_obec: string;
  needs_obvod: string;
  poslanci_edit_button: string;
  poslanci_hide_button: string;
  poslanci_select_all: string;
  poslanci_select_none: string;
  poslanci_selected: string;
  poslanci_none: string;
  senator_missing: string;
  captions: Record<AddresseeType, string>;
  style_title: string;
  forma_label: string;
  delka_label: string;
  variant_button: string;
  footer_label: string;
  custom_label: string;
  custom_hint: string;
  sender_name_label: string;
  sender_address_label: string;
  private_hint: string;
  letters_title: string;
  letters_empty: string;
  /** Pro čtečky před osloveném (to se ukazuje u každého adresáta hned). */
  salutation_label: string;
  show_letter: string;
  hide_letter: string;
  copy_button: string;
  copied: string;
  copy_failed: string;
  mail_button: string;
  pdf_button: string;
  no_email: string;
  databox_label: string;
  databox_howto: string[];
  post_hint: string;
  zip_button: string;
  zip_caption: string;
  working: string;
  error: string;
  file_zip: string;
  mail_subject: string;
  pdf_subject: string;
  pdf_page: string;
  pdf_creator: string;
  postal: PostalTexts;
}

export interface ZakonTexts {
  meta_title: string;
  kicker: string;
  lead: string;
  source_signature: string;
  source_browser: string;
  source_empty: string;
  loading: string;
  meta_title_section: string;
  contents_title: string;
  placeholder_tag: string;
  show_paragraph: string;
  pdf_button: string;
  docx_button: string;
  working: string;
  error: string;
  file_base: string;
  pdf_page: string;
  pdf_creator: string;
}

export interface UiAkceFile {
  akce: AkceTexts;
  zakon: ZakonTexts;
}

/** Doplní {klíč} v šabloně. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
