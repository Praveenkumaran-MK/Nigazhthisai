export interface FieldOption {
  value: string;
  label: string;
}

export type FormFieldType = "text" | "number" | "select" | "checkbox";

export interface FormFieldConfig {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: FieldOption[];
  /**
   * For "select" fields whose valid options depend on another field's
   * current value in the same form (e.g. only stops on the selected
   * route) — takes precedence over the static `options` when provided.
   * Re-evaluated on every render, so it always reflects the live form state.
   */
  optionsForValues?: (values: Record<string, unknown>) => FieldOption[];
  step?: string;
  placeholder?: string;
}

export interface ColumnConfig<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}
