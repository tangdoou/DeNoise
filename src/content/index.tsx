import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, INITIAL_SESSION_STATE, STORAGE_KEYS } from '../shared/constants';
import { getAppSettings, getSessionState } from '../shared/storage';
import { AppSettings, ExtensionMessage, FocusSessionState } from '../shared/types';
import { domPurifier } from './domPurifier';
import { extractCurrentPageDomSkeleton } from './siteAdapters';
import { BlackboxDrawer } from './shadowHud/BlackboxDrawer';
import { DriftNudgeBar } from './shadowHud/DriftNudgeBar';
import { FloatingPill } from './shadowHud/FloatingPill';
import { ReceiptModal } from './shadowHud/ReceiptModal';

const SHADOW_HOST_ID = 'denoise-shadow-host';

const SHADOW_HUD_CSS = `
  :host {
    all: initial;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #191919;
    -webkit-font-smoothing: antialiased;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .dn-hud-shell {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #191919;
    line-height: 1.5;
  }

  .dn-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-variant-numeric: tabular-nums;
  }

  /* Shared Buttons */
  .dn-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid #E9E9E7;
    background: #FFFFFF;
    color: #191919;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    cursor: pointer;
    transition: background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
    white-space: nowrap;
  }

  .dn-btn:hover:not(:disabled) {
    background: #F7F7F5;
    border-color: #191919;
  }

  .dn-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .dn-btn-primary {
    background: #191919;
    color: #FFFFFF;
    border-color: #191919;
  }

  .dn-btn-primary:hover:not(:disabled) {
    background: #333333;
    border-color: #333333;
  }

  .dn-btn-secondary {
    background: #F7F7F5;
    color: #191919;
    border-color: #E9E9E7;
  }

  .dn-btn-secondary:hover:not(:disabled) {
    background: #EFEFED;
    border-color: #191919;
  }

  .dn-btn-ghost {
    background: transparent;
    color: #787774;
    border-color: #E9E9E7;
  }

  .dn-btn-ghost:hover:not(:disabled) {
    background: #F7F7F5;
    color: #191919;
  }

  .dn-btn-sm {
    padding: 5px 10px;
    font-size: 12px;
  }

  .dn-btn-lg {
    padding: 10px 18px;
    font-size: 13.5px;
    font-weight: 600;
  }

  .dn-btn-full {
    width: 100%;
  }

  .dn-btn-flex {
    flex: 1;
  }

  .dn-icon-btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: #787774;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
  }

  .dn-icon-btn:hover {
    background: #EFEFED;
    color: #191919;
  }

  .dn-icon-btn-sm {
    width: 24px;
    height: 24px;
    font-size: 12px;
  }

  /* Floating Pill */
  .dn-pill-anchor {
    position: fixed;
    z-index: 2147483640;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: auto;
    user-select: none;
  }

  .dn-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 13px;
    background: #FFFFFF;
    color: #191919;
    border: 1px solid #191919;
    border-radius: 9999px;
    box-shadow: 0 4px 18px rgba(25, 25, 25, 0.12);
    font-size: 12.5px;
    font-weight: 500;
    cursor: grab;
    transition: box-shadow 0.2s ease, transform 0.15s ease, background 0.15s ease;
    white-space: nowrap;
  }

  .dn-pill:hover {
    background: #F7F7F5;
    box-shadow: 0 6px 22px rgba(25, 25, 25, 0.16);
  }

  .dn-pill:active {
    cursor: grabbing;
  }

  .dn-pill-active {
    background: #F7F7F5;
  }

  .dn-pill-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
  }

  .dn-flow-dot {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: #0F7B6C;
    box-shadow: 0 0 0 3px rgba(15, 123, 108, 0.18);
    animation: dn-pulse 2.2s infinite ease-in-out;
  }

  .dn-pill-sep {
    color: #D3D3CF;
  }

  .dn-pill-metric {
    color: #37352F;
  }

  .dn-pill-metric strong {
    color: #191919;
    font-weight: 600;
  }

  .dn-blackbox-badge {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
    padding: 3px 9px;
    border-radius: 9999px;
    border: 1px solid #191919;
    background: #191919;
    color: #FFFFFF;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .dn-blackbox-badge:hover {
    background: #333333;
  }

  .dn-pill-menu {
    width: 288px;
    background: #FFFFFF;
    border: 1px solid #E9E9E7;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(25, 25, 25, 0.14);
    overflow: hidden;
    animation: dn-slide-up 0.18s ease-out;
  }

  .dn-pill-menu-header {
    padding: 12px 14px 10px;
    background: #F7F7F5;
  }

  .dn-pill-menu-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }

  .dn-pill-menu-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #191919;
  }

  .dn-tag {
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border-radius: 5px;
    border: 1px solid #E9E9E7;
    background: #FFFFFF;
    color: #37352F;
    font-size: 11px;
    font-weight: 500;
  }

  .dn-pill-menu-task {
    font-size: 12px;
    color: #787774;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dn-pill-menu-divider {
    height: 1px;
    background: #E9E9E7;
  }

  .dn-pill-menu-actions {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .dn-menu-item {
    appearance: none;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 8px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #191919;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s ease;
  }

  .dn-menu-item:hover:not(:disabled) {
    background: #F7F7F5;
  }

  .dn-menu-item:disabled {
    color: #0F7B6C;
    cursor: default;
  }

  .dn-menu-item-danger {
    color: #E03E3E;
  }

  .dn-menu-item-danger:hover:not(:disabled) {
    background: #FDF2F2;
  }

  /* Backdrop & Modals */
  .dn-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483645;
    background: rgba(25, 25, 25, 0.34);
    backdrop-filter: blur(3px);
    display: flex;
    justify-content: flex-end;
    pointer-events: auto;
    animation: dn-fade-in 0.18s ease-out;
  }

  .dn-backdrop-center,
  .dn-backdrop-strict {
    justify-content: center;
    align-items: center;
    padding: 20px;
  }

  .dn-backdrop-strict {
    background: rgba(25, 25, 25, 0.45);
    backdrop-filter: blur(6px);
  }

  /* Blackbox Drawer */
  .dn-drawer {
    width: 440px;
    max-width: calc(100vw - 24px);
    height: 100vh;
    background: #FFFFFF;
    border-left: 1px solid #E9E9E7;
    box-shadow: -8px 0 32px rgba(25, 25, 25, 0.14);
    display: flex;
    flex-direction: column;
    animation: dn-slide-left 0.22s ease-out;
  }

  .dn-drawer-header {
    padding: 18px 20px 14px;
    border-bottom: 1px solid #E9E9E7;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    background: #FFFFFF;
  }

  .dn-drawer-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dn-drawer-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #191919;
  }

  .dn-count-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 6px;
    border-radius: 9999px;
    background: #191919;
    color: #FFFFFF;
    font-size: 11px;
    font-weight: 600;
  }

  .dn-drawer-subtitle {
    margin: 6px 0 0;
    font-size: 12.5px;
    color: #787774;
    line-height: 1.5;
  }

  .dn-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    background: #F7F7F5;
  }

  .dn-drawer-footer {
    padding: 14px 20px;
    border-top: 1px solid #E9E9E7;
    background: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .dn-empty-state {
    padding: 36px 20px;
    border: 1px dashed #D3D3CF;
    border-radius: 8px;
    background: #FFFFFF;
    text-align: center;
  }

  .dn-empty-icon {
    font-size: 26px;
    margin-bottom: 8px;
  }

  .dn-empty-title {
    font-size: 14px;
    font-weight: 600;
    color: #191919;
    margin-bottom: 4px;
  }

  .dn-empty-desc {
    font-size: 12.5px;
    color: #787774;
    line-height: 1.55;
  }

  .dn-blackbox-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .dn-blackbox-card {
    background: #FFFFFF;
    border: 1px solid #E9E9E7;
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.16s ease;
  }

  .dn-blackbox-card:hover {
    border-color: #191919;
  }

  .dn-blackbox-thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #F7F7F5;
    border-bottom: 1px solid #E9E9E7;
    overflow: hidden;
  }

  .dn-blackbox-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .dn-blackbox-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #F7F7F5;
  }

  .dn-placeholder-bar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 10px;
    border-bottom: 1px solid #E9E9E7;
    background: #FFFFFF;
  }

  .dn-placeholder-dot {
    width: 7px;
    height: 7px;
    border-radius: 9999px;
    background: #D3D3CF;
  }

  .dn-placeholder-host {
    margin-left: 6px;
    font-size: 11px;
    color: #787774;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dn-placeholder-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
  }

  .dn-placeholder-favicon {
    width: 24px;
    height: 24px;
    border-radius: 4px;
  }

  .dn-placeholder-glyph {
    font-size: 22px;
  }

  .dn-placeholder-caption {
    font-size: 11.5px;
    color: #787774;
  }

  .dn-blackbox-score {
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: 2px 7px;
    border-radius: 5px;
    background: rgba(25, 25, 25, 0.86);
    color: #FFFFFF;
    font-size: 11px;
    font-weight: 500;
  }

  .dn-blackbox-meta {
    padding: 12px 14px 10px;
  }

  .dn-blackbox-card-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #191919;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .dn-blackbox-url {
    font-size: 11.5px;
    color: #787774;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 8px;
  }

  .dn-blackbox-tags {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .dn-reason-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 5px;
    background: #F7F7F5;
    border: 1px solid #E9E9E7;
    color: #37352F;
    font-size: 11.5px;
    font-weight: 500;
  }

  .dn-time-tag {
    font-size: 11px;
    color: #787774;
  }

  .dn-blackbox-actions {
    padding: 0 14px 12px;
  }

  /* Drift Nudge Top Bar */
  .dn-nudge-wrapper {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483642;
    width: min(840px, calc(100vw - 28px));
    pointer-events: auto;
    animation: dn-slide-down 0.24s ease-out;
  }

  .dn-nudge-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 14px;
    background: #FFFFFF;
    color: #191919;
    border: 1px solid #191919;
    border-left: 4px solid #D9730D;
    border-radius: 8px;
    box-shadow: 0 8px 26px rgba(25, 25, 25, 0.14);
  }

  .dn-nudge-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    flex: 1;
    min-width: 220px;
  }

  .dn-nudge-text {
    font-size: 13px;
    color: #191919;
  }

  .dn-nudge-reason {
    padding: 2px 7px;
    border-radius: 5px;
    background: #F7F7F5;
    border: 1px solid #E9E9E7;
    font-size: 11.5px;
    color: #787774;
  }

  .dn-nudge-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Strict Mode Intercept Card */
  .dn-strict-card {
    width: min(500px, calc(100vw - 32px));
    background: #FFFFFF;
    border: 1px solid #191919;
    border-radius: 10px;
    padding: 26px 24px 22px;
    box-shadow: 0 18px 48px rgba(25, 25, 25, 0.2);
    animation: dn-slide-up 0.2s ease-out;
  }

  .dn-strict-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 5px;
    background: #F7F7F5;
    border: 1px solid #E9E9E7;
    font-size: 11.5px;
    font-weight: 600;
    color: #191919;
    margin-bottom: 12px;
  }

  .dn-strict-title {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 700;
    color: #191919;
    line-height: 1.35;
  }

  .dn-strict-desc {
    margin: 0 0 16px;
    font-size: 13px;
    color: #787774;
    line-height: 1.6;
  }

  .dn-strict-page-box {
    padding: 10px 12px;
    background: #F7F7F5;
    border: 1px solid #E9E9E7;
    border-radius: 6px;
    margin-bottom: 18px;
  }

  .dn-strict-page-title {
    font-size: 13px;
    font-weight: 600;
    color: #191919;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dn-strict-page-url {
    font-size: 11.5px;
    color: #787774;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .dn-strict-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Thermal Receipt Modal */
  .dn-receipt-shell {
    width: min(432px, calc(100vw - 28px));
    max-height: calc(100vh - 36px);
    display: flex;
    flex-direction: column;
    filter: drop-shadow(0 16px 38px rgba(25, 25, 25, 0.22));
    animation: dn-slide-up 0.22s ease-out;
  }

  .dn-receipt-edge {
    height: 8px;
    width: 100%;
    flex-shrink: 0;
  }

  .dn-receipt-edge-top {
    background:
      linear-gradient(135deg, transparent 50%, #FFFFFF 50%) 0 0 / 12px 8px repeat-x,
      linear-gradient(225deg, transparent 50%, #FFFFFF 50%) 0 0 / 12px 8px repeat-x;
  }

  .dn-receipt-edge-bottom {
    background:
      linear-gradient(45deg, transparent 50%, #FFFFFF 50%) 0 0 / 12px 8px repeat-x,
      linear-gradient(315deg, transparent 50%, #FFFFFF 50%) 0 0 / 12px 8px repeat-x;
  }

  .dn-receipt-paper {
    background: #FFFFFF;
    border-left: 1px solid #E9E9E7;
    border-right: 1px solid #E9E9E7;
    padding: 20px 24px 20px;
    overflow-y: auto;
  }

  .dn-receipt-header {
    text-align: center;
    padding-bottom: 4px;
  }

  .dn-receipt-brand {
    font-size: 19px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #191919;
  }

  .dn-receipt-sub {
    margin-top: 2px;
    font-size: 10px;
    letter-spacing: 0.18em;
    color: #787774;
  }

  .dn-receipt-title {
    margin-top: 8px;
    display: inline-block;
    padding: 2px 10px;
    border: 1px solid #191919;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #191919;
  }

  .dn-receipt-dashed {
    margin: 14px 0;
    border-top: 1px dashed #D3D3CF;
  }

  .dn-receipt-meta {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .dn-receipt-meta-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    font-size: 12.5px;
  }

  .dn-receipt-label {
    color: #787774;
    flex-shrink: 0;
  }

  .dn-receipt-val {
    color: #191919;
    text-align: right;
    word-break: break-word;
  }

  .dn-receipt-val-strong {
    font-weight: 600;
  }

  .dn-receipt-table {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dn-receipt-table-head {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: #787774;
    letter-spacing: 0.04em;
    margin-bottom: 2px;
  }

  .dn-receipt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12.5px;
    color: #37352F;
  }

  .dn-receipt-row .dn-mono {
    color: #191919;
    font-weight: 600;
  }

  .dn-receipt-summary {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #F7F7F5;
    border: 1px solid #E9E9E7;
    border-radius: 8px;
    padding: 12px 14px;
  }

  .dn-receipt-retro {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #F8FAF9;
    border: 1px solid #D7E9E0;
    border-radius: 8px;
    padding: 12px 14px;
  }

  .dn-receipt-retro-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .dn-receipt-retro-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #71717A;
    text-transform: uppercase;
  }

  .dn-receipt-retro-badge {
    font-size: 10.5px;
    font-weight: 600;
    color: #047857;
    background: #ECFDF5;
    border: 1px solid #A7F3D0;
    border-radius: 5px;
    padding: 1px 6px;
  }

  .dn-receipt-retro-badge.is-pending {
    color: #787774;
    background: #F7F7F5;
    border-color: #E9E9E7;
  }

  .dn-receipt-retro-summary {
    margin: 0;
    font-size: 12px;
    line-height: 1.65;
    color: #3F3F46;
  }

  .dn-receipt-retro-list {
    margin: 0;
    padding-left: 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11.5px;
    line-height: 1.55;
    color: #71717A;
  }

  .dn-receipt-snr-row,
  .dn-receipt-grade-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dn-receipt-snr-label {
    font-size: 12.5px;
    font-weight: 600;
    color: #191919;
  }

  .dn-receipt-snr-val {
    font-size: 18px;
    font-weight: 700;
    color: #0F7B6C;
  }

  .dn-grade-stamp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 10px;
    border: 2px solid #191919;
    border-radius: 4px;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #191919;
    background: #FFFFFF;
    transform: rotate(-3deg);
  }

  .dn-receipt-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dn-receipt-actions-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  @keyframes dn-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }

  @keyframes dn-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes dn-slide-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes dn-slide-down {
    from { opacity: 0; transform: translate(-50%, -10px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @keyframes dn-slide-left {
    from { opacity: 0.6; transform: translateX(24px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;

function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(null);
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve((response as T) ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

function unwrapSessionResponse(raw: unknown): FocusSessionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybeWrapped = (raw as { data?: FocusSessionState; state?: FocusSessionState });
  const candidate = maybeWrapped.data ?? maybeWrapped.state ?? (raw as FocusSessionState);
  if (candidate && typeof candidate.isActive === 'boolean') {
    return {
      ...INITIAL_SESSION_STATE,
      ...candidate,
      stats: {
        ...INITIAL_SESSION_STATE.stats,
        ...(candidate.stats || {})
      }
    };
  }
  return null;
}

function normalizeUrlForCompare(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return rawUrl.split('#')[0].replace(/\/$/, '');
  }
}

function isUrlWhitelisted(
  currentUrl: string,
  session: FocusSessionState,
  settings: AppSettings
): boolean {
  let hostname = '';
  try {
    hostname = new URL(currentUrl).hostname.toLowerCase();
  } catch {
    hostname = window.location.hostname.toLowerCase();
  }

  for (const domain of settings.globalWhitelistDomains || []) {
    const cleanDomain = domain.trim().toLowerCase();
    if (!cleanDomain) continue;
    if (hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`)) {
      return true;
    }
  }

  const normalizedCurrent = normalizeUrlForCompare(currentUrl);
  for (const whitelistedUrl of session.sessionWhitelistUrls || []) {
    if (
      whitelistedUrl === currentUrl ||
      normalizeUrlForCompare(whitelistedUrl) === normalizedCurrent
    ) {
      return true;
    }
  }

  return false;
}

const DeNoiseHudApp: React.FC = () => {
  const [session, setSession] = useState<FocusSessionState>(INITIAL_SESSION_STATE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [currentUrl, setCurrentUrl] = useState<string>(() => window.location.href);
  const [blackboxOpen, setBlackboxOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadInitial = async () => {
      const [remoteRes, storedSettings] = await Promise.all([
        sendMessage({ type: 'GET_SESSION_STATE' }),
        getAppSettings()
      ]);
      const fromRuntime = unwrapSessionResponse(remoteRes);
      const resolvedSession = fromRuntime ?? (await getSessionState());
      if (!mounted) return;
      setSession(resolvedSession);
      setSettings(storedSettings);
    };

    void loadInitial();

    const handleStorageChange = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEYS.SESSION]?.newValue) {
        const next = unwrapSessionResponse(changes[STORAGE_KEYS.SESSION].newValue);
        if (next) setSession(next);
      }
      if (changes[STORAGE_KEYS.SETTINGS]?.newValue) {
        const nextSettings = changes[STORAGE_KEYS.SETTINGS].newValue as AppSettings;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...nextSettings,
          providers: {
            ...DEFAULT_SETTINGS.providers,
            ...(nextSettings.providers || {})
          }
        });
      }
    };

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (message?.type === 'SESSION_STATE_UPDATED' && message.payload?.state) {
        const next = unwrapSessionResponse(message.payload.state);
        if (next) setSession(next);
      }
    };

    chrome.storage?.onChanged?.addListener(handleStorageChange);
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);

    return () => {
      mounted = false;
      chrome.storage?.onChanged?.removeListener(handleStorageChange);
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    };
  }, []);

  useEffect(() => {
    const syncUrl = () => {
      if (window.location.href !== currentUrl) {
        setCurrentUrl(window.location.href);
      }
    };

    window.addEventListener('popstate', syncUrl);
    window.addEventListener('hashchange', syncUrl);
    const urlPoll = window.setInterval(syncUrl, 1000);

    return () => {
      window.removeEventListener('popstate', syncUrl);
      window.removeEventListener('hashchange', syncUrl);
      window.clearInterval(urlPoll);
    };
  }, [currentUrl]);

  const whitelisted = useMemo(
    () => isUrlWhitelisted(currentUrl, session, settings),
    [currentUrl, session, settings]
  );

  useEffect(() => {
    if (session.isActive && !whitelisted) {
      domPurifier.start(session);
    } else {
      domPurifier.stop();
    }
  }, [session.isActive, session.sessionId, whitelisted, currentUrl]);

  useEffect(() => {
    return () => {
      domPurifier.stop();
    };
  }, []);

  useEffect(() => {
    if (!session.isActive) {
      setBlackboxOpen(false);
    }
  }, [session.isActive]);

  const handleWhitelistCurrentPage = useCallback(() => {
    void sendMessage({
      type: 'WHITELIST_CURRENT_URL',
      payload: { url: currentUrl }
    }).then((res) => {
      const next = unwrapSessionResponse(res);
      if (next) setSession(next);
    });
  }, [currentUrl]);

  const handleStopFocus = useCallback(() => {
    void sendMessage({
      type: 'STOP_FOCUS_SESSION',
      payload: { showReceipt: true }
    }).then((res) => {
      const next = unwrapSessionResponse(res);
      if (next) setSession(next);
    });
  }, []);

  const handleRestoreBlackboxTab = useCallback((blackboxItemId: string) => {
    void sendMessage({
      type: 'RESTORE_BLACKBOX_TAB',
      payload: { blackboxItemId }
    }).then((res) => {
      const next = unwrapSessionResponse(res);
      if (next) setSession(next);
    });
  }, []);

  const handleRestoreAllTabs = useCallback(() => {
    void sendMessage({ type: 'RESTORE_ALL_TABS' }).then((res) => {
      const next = unwrapSessionResponse(res);
      if (next) setSession(next);
    });
  }, []);

  const handleDismissReceipt = useCallback(() => {
    setSession((prev) => ({ ...prev, showReceiptModal: false }));
    void sendMessage({ type: 'DISMISS_RECEIPT_MODAL' }).then((res) => {
      const next = unwrapSessionResponse(res);
      if (next) setSession(next);
    });
  }, []);

  const handleSwitchToLearningTab = useCallback(() => {
    void sendMessage({ type: 'SWITCH_TO_LEARNING_TAB' });
  }, []);

  const handleParkAndSwitch = useCallback(() => {
    void sendMessage({
      type: 'PARK_CURRENT_TAB_AND_SWITCH',
      payload: { url: currentUrl, title: document.title }
    });
  }, [currentUrl]);

  return (
    <div className="dn-hud-shell">
      {session.isActive && (
        <>
          <DriftNudgeBar
            session={session}
            isWhitelisted={whitelisted}
            currentUrl={currentUrl}
            onSwitchToLearningTab={handleSwitchToLearningTab}
            onParkAndSwitch={handleParkAndSwitch}
            onWhitelistCurrentPage={handleWhitelistCurrentPage}
          />

          <FloatingPill
            session={session}
            isWhitelisted={whitelisted}
            onWhitelistCurrentPage={handleWhitelistCurrentPage}
            onOpenBlackbox={() => setBlackboxOpen(true)}
            onStopFocus={handleStopFocus}
          />

          <BlackboxDrawer
            open={blackboxOpen}
            tabs={session.blackboxTabs}
            onClose={() => setBlackboxOpen(false)}
            onRestoreTab={handleRestoreBlackboxTab}
            onRestoreAll={handleRestoreAllTabs}
          />
        </>
      )}

      {session.showReceiptModal && session.lastCompletedSession && (
        <ReceiptModal
          session={session}
          onRestoreAllTabs={handleRestoreAllTabs}
          onDismiss={handleDismissReceipt}
        />
      )}
    </div>
  );
};

function registerDomSkeletonResponder(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message?.type === 'EXTRACT_TAB_DOM_SKELETON') {
      sendResponse(extractCurrentPageDomSkeleton());
      return true;
    }
    return false;
  });
}

function mountShadowHud(): void {
  if (window.self !== window.top) return;
  if (document.getElementById(SHADOW_HOST_ID)) return;

  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID;
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 0',
    'height: 0',
    'z-index: 2147483647',
    'pointer-events: none'
  ].join(';');

  (document.documentElement || document.body).appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.id = 'denoise-hud-styles';
  styleEl.textContent = SHADOW_HUD_CSS;
  shadowRoot.appendChild(styleEl);

  const mountNode = document.createElement('div');
  mountNode.id = 'denoise-hud-root';
  shadowRoot.appendChild(mountNode);

  const root = createRoot(mountNode);
  root.render(<DeNoiseHudApp />);
}

function bootstrap(): void {
  if (window.self !== window.top) return;
  registerDomSkeletonResponder();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountShadowHud, { once: true });
  } else {
    mountShadowHud();
  }
}

bootstrap();
