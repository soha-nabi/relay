import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface DrawerNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: DrawerNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  title?: string;
  subtitle?: string;
}

export default function MobileDrawer({
  isOpen,
  onClose,
  navItems,
  activeId,
  onSelect,
  title = 'Relay',
  subtitle,
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => {
      document.body.classList.remove('drawer-open');
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Swipe-right-to-close via touch delta
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    const delta = touchCurrentX.current - touchStartX.current;
    if (delta > 60) onClose();
  };

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className={`drawer-backdrop ${isOpen ? 'drawer-backdrop--visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Drawer Panel ──────────────────────────────────────────────────── */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`mobile-drawer ${isOpen ? 'mobile-drawer--open' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-header-identity">
            <span className="drawer-logo">{title}</span>
            {subtitle && <span className="drawer-subtitle">{subtitle}</span>}
          </div>
          <button
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Divider */}
        <div className="drawer-divider" />

        {/* Nav items */}
        <nav className="drawer-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = activeId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className={`drawer-nav-item${isActive ? ' drawer-nav-item--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Active left-edge indicator */}
                <span className="drawer-active-bar" aria-hidden="true" />
                <span className="drawer-nav-icon">{item.icon}</span>
                <span className="drawer-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="drawer-footer">
          <span className="drawer-footer-text">Relay · Recovery Intelligence</span>
        </div>
      </div>
    </>
  );
}
