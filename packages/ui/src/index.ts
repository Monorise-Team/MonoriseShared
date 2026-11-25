export { cn } from "./lib/cn.js";
export {
  APPEARANCE_STORAGE_KEY,
  WALLPAPER_BLUR_MAX,
  WALLPAPER_DIM_MAX,
  appearanceInitScript,
  applyAppearance,
  backdropModes,
  defaultAppearance,
  defaultBackdrop,
  normalizeAppearance,
  readAppearance,
  resolveMode,
  type Appearance,
  type BackdropMode,
  type Density,
  type FontScale,
  type ModePreference,
} from "./lib/appearance.js";
export { ThemeProvider, useTheme } from "./lib/ThemeProvider.js";
export { useReducedMotion } from "./lib/useReducedMotion.js";

export { Avatar, avatarColor, initials, type AvatarProps } from "./components/Avatar.js";
export { Badge, type BadgeProps, type BadgeTone } from "./components/Badge.js";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./components/Button.js";
export { Card, CardHeader, CardTitle, type CardProps, type Surface } from "./components/Card.js";
export { Checkbox, Switch, type CheckboxProps, type SwitchProps } from "./components/Checkbox.js";
export { ConfirmDialog, Dialog, type ConfirmDialogProps, type DialogProps } from "./components/Dialog.js";
export {
  EmptyState,
  ProgressBar,
  Skeleton,
  type EmptyStateProps,
  type ProgressBarProps,
} from "./components/Feedback.js";
export { Kbd } from "./components/Kbd.js";
export {
  AppBackdrop,
  AppShell,
  Separator,
  TitleBar,
  Toolbar,
  WALLPAPER_URLS,
  type AppBackdropProps,
  type AppShellProps,
  type TitleBarProps,
} from "./components/Layout.js";
export { ListItem, type ListItemProps } from "./components/ListItem.js";
export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  type MenuItemProps,
} from "./components/Menu.js";
export { SearchField, type SearchFieldProps } from "./components/SearchField.js";
export {
  SidebarItem,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  type SidebarItemProps,
  type SidebarLinkProps,
  type SidebarSectionProps,
} from "./components/Sidebar.js";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/Tabs.js";
export {
  Select,
  TextArea,
  TextField,
  type SelectProps,
  type TextAreaProps,
  type TextFieldProps,
} from "./components/TextField.js";
export { Tooltip, TooltipProvider, type TooltipProps } from "./components/Tooltip.js";

// Paleta poleceń i skróty (MonoriseShared#53)
export {
  DEFAULT_RESERVED_SHORTCUTS,
  SEQUENCE_TIMEOUT_MS,
  createSequenceTracker,
  findShortcutConflict,
  formatShortcut,
  formatShortcutParts,
  isApplePlatform,
  isValidShortcut,
  matchesShortcut,
  normalizeShortcut,
  parseShortcut,
  recordShortcut,
  shortcutsConflict,
  validateShortcut,
  type ExistingShortcutEntry,
  type ParsedShortcut,
  type SequenceMatchResult,
  type SequenceTracker,
  type ShortcutChord,
  type ShortcutConflictOptions,
  type ShortcutFormatOptions,
  type ShortcutIssue,
  type ShortcutKeyboardEvent,
} from "./lib/shortcuts.js";
export {
  useHotkeys,
  type HotkeyBinding,
  type HotkeyBindings,
  type HotkeyHandler,
  type UseHotkeysOptions,
} from "./lib/useHotkeys.js";
export {
  CommandPalette,
  useCommandPalette,
  type CommandPaletteGroup,
  type CommandPaletteItem,
  type CommandPaletteProps,
  type CommandPaletteSource,
  type UseCommandPaletteOptions,
  type UseCommandPaletteResult,
} from "./components/CommandPalette.js";
export {
  ShortcutsHelp,
  type ShortcutHelpCategory,
  type ShortcutHelpItem,
  type ShortcutsHelpProps,
} from "./components/ShortcutsHelp.js";
export { ShortcutRecorder, type ShortcutRecorderProps } from "./components/ShortcutRecorder.js";
