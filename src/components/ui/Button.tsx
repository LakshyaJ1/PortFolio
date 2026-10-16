"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { emit } from "@/lib/events";
import { Icon, type IconName } from "./Icon";
import styles from "./Button.module.css";

type Common = {
  variant?: "fix" | "line" | "quiet";
  size?: "md" | "lg";
  icon?: IconName;
  /** id reported to the mascot on hover (excited reaction) */
  cta?: string;
  children: ReactNode;
};

type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Button(props: AsButton | AsLink) {
  const { variant = "line", size = "md", icon, cta, children, className, ...rest } = props;
  const cls = [styles.btn, styles[variant], styles[size], className].filter(Boolean).join(" ");
  const hover = cta
    ? {
        onPointerEnter: () => emit("cta:hover", { id: cta }),
        onPointerLeave: () => emit("cta:leave", { id: cta }),
      }
    : {};
  const inner = (
    <>
      <span className={styles.label}>{children}</span>
      {icon ? (
        <span className={styles.icon}>
          <Icon name={icon} size={size === "lg" ? 20 : 16} />
        </span>
      ) : null}
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...a } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    const external = /^https?:/.test(href);
    return (
      <a
        href={href}
        className={cls}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...hover}
        {...a}
      >
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...hover} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  );
}
