import { useEffect, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
  ComponentProps,
} from "react";
import styles from "./ui.module.css";

export function Button({
  variant = "outline",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "outline" | "primary" | "ghost" }) {
  return (
    <button
      type="button"
      {...props}
      className={`${styles.button} ${variant === "outline" ? "" : styles[variant]} ${className}`}
    />
  );
}
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${styles.input} ${className}`} />;
}
export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${styles.select} ${className}`} />;
}
export function Check({ children, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.check}>
      <input {...props} type="checkbox" />
      {children}
    </label>
  );
}

export function Popover({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current?.open && event.target instanceof Node && !ref.current.contains(event.target))
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      ref={ref}
      className={styles.popover}
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>{title}</summary>
      <div className={styles.popoverBody}>{children}</div>
    </details>
  );
}

/** Native dialogs supply focus containment, Escape handling and focus return.
 * Keep them mounted so closing a value viewer restores the invoking table cell. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`${styles.dialog} ${wide ? styles.wide : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.dialogHeader}>
        <strong>{title}</strong>
        <Button variant="ghost" onClick={onClose} aria-label="Close dialog">
          ✕
        </Button>
      </div>
      {open && <div className={styles.dialogBody}>{children}</div>}
    </dialog>
  );
}
