import type * as React from 'react';
type IconName = 'arrow-right'|'chevron-right'|'chevron-down'|'chevron-left'|'plus'|'minus'|'close'|'info'|'alert'|'external'|'download'|'mail'|'share'|'compare'|'law'|'refresh';
type ForcedState = 'hover'|'focus'|'active';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary'|'secondary'|'inverse'|'inverse-outline'; block?: boolean; icon?: IconName; iconEnd?: IconName; state?: ForcedState }
export declare function Button(p: ButtonProps): React.ReactElement;
export interface StickyBarProps { children: React.ReactNode; static?: boolean }
export declare function StickyBar(p: StickyBarProps): React.ReactElement;
export interface AnswerOptionProps { label: string; selected?: boolean; disabled?: boolean; /** shown as "Nejde s: …" */ conflict?: string; multiple?: boolean; state?: ForcedState; onSelect?: () => void; /** called when a disabled option is tapped */ onExplain?: () => void; children?: React.ReactNode }
export declare function AnswerOption(p: AnswerOptionProps): React.ReactElement;
export interface AnswerGroupProps { legend: string; lede?: string; error?: string; children: React.ReactNode }
export declare function AnswerGroup(p: AnswerGroupProps): React.ReactElement;
export interface DisclosureProps { label?: string; open?: boolean; mode?: 'sheet'|'inline'; state?: ForcedState; onToggle?: () => void; children?: React.ReactNode }
export declare function Disclosure(p: DisclosureProps): React.ReactElement;
export interface BottomSheetProps { open?: boolean; title: string; /** max 4 */ lines: string[]; sources?: { label: string; href?: string }[]; onClose?: () => void; fixed?: boolean }
export declare function BottomSheet(p: BottomSheetProps): React.ReactElement | null;
export interface BudgetSliderProps { value?: number; /** snap distance to anchors, default 0.15 */ snap?: number; unit?: string; min?: number; max?: number; step?: number; anchors?: { value: number; label: string }[]; adults?: number; label?: string; onChange?: (v: number) => void }
export declare function BudgetSlider(p: BudgetSliderProps): React.ReactElement;
export interface ProgressBarProps { total?: number; current?: number; label?: boolean }
export declare function ProgressBar(p: ProgressBarProps): React.ReactElement;
export interface StatementPreviewProps { paragraphs: string[]; open?: boolean; label?: string; onToggle?: (open: boolean) => void }
export declare function StatementPreview(p: StatementPreviewProps): React.ReactElement;
export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> { label: string; hint?: string; error?: string; value?: string; state?: ForcedState }
export declare function TextInput(p: TextInputProps): React.ReactElement;
export interface SelectProps { label: string; options: string[]; value?: string; error?: string; disabled?: boolean; placeholder?: string; state?: ForcedState }
export declare function Select(p: SelectProps): React.ReactElement;
export interface CheckboxProps { label: string; checked?: boolean; error?: string; disabled?: boolean; state?: ForcedState; children?: React.ReactNode }
export declare function Checkbox(p: CheckboxProps): React.ReactElement;
export interface ToggleProps { label: string; hint?: string; checked?: boolean }
export declare function Toggle(p: ToggleProps): React.ReactElement;
export interface StepSliderProps { label: string; /** exactly 3 */ steps: string[]; value?: number; onChange?: (i: number) => void }
export declare function StepSlider(p: StepSliderProps): React.ReactElement;
export interface BarChartProps { title?: string; /** in answer order */ data: { label: string; value: number }[]; total?: number; unit?: string; foot?: string; headingLevel?: 2|3|4 }
export declare function BarChart(p: BarChartProps): React.ReactElement;
export interface SampleBannerProps { title?: string; text?: string }
export declare function SampleBanner(p: SampleBannerProps): React.ReactElement;
export declare function SampleBadge(p: { children?: React.ReactNode }): React.ReactElement;
export interface StanceBlockProps { kicker?: string; text: string; by?: string; primary?: string; secondary?: string; onPrimary?: () => void; onSecondary?: () => void }
export declare function StanceBlock(p: StanceBlockProps): React.ReactElement;
/** Always 3:2; height follows width. Nothing may overlap it. */
export interface FlagProps { width?: number|string; animate?: boolean; unfold?: boolean; label?: string }
export declare function Flag(p: FlagProps): React.ReactElement;
export declare function FlagHero(p: FlagProps): React.ReactElement;
/** Selection mark: empty ring, or a white disc with a whole flag. */
export declare function SelectMark(p: { on?: boolean }): React.ReactElement;
export declare function Wordmark(p: { href?: string }): React.ReactElement;
export interface FlagUnfoldProps { title?: string; text?: string; /** freeze at this ms for docs */ still?: number; fixed?: boolean }
export declare function FlagUnfold(p: FlagUnfoldProps): React.ReactElement;
export interface PhotoFrameProps { variant?: 'ring'|'ribbon'|'corner'|'duotone'; slogan?: string; photo?: string; size?: number; label?: string }
export declare function PhotoFrame(p: PhotoFrameProps): React.ReactElement;
export interface ShareImageProps { format?: 'og'|'story'|'square'; headline?: string; choices: string[]; scale?: number }
export declare function ShareImage(p: ShareImageProps): React.ReactElement;
export interface IconProps { name: IconName; size?: number; title?: string; className?: string }
export declare function Icon(p: IconProps): React.ReactElement;
export declare function AppBar(p: { sample?: boolean; back?: string; night?: boolean }): React.ReactElement;
/** 12480 → "12 480", (9.2, 1) → "9,2" */
export declare function formatCz(n: number, digits?: number): string;
declare global { interface Window { Kompas: { Button: typeof Button; StickyBar: typeof StickyBar; AnswerOption: typeof AnswerOption; AnswerGroup: typeof AnswerGroup; Disclosure: typeof Disclosure; BottomSheet: typeof BottomSheet; BudgetSlider: typeof BudgetSlider; ProgressBar: typeof ProgressBar; StatementPreview: typeof StatementPreview; TextInput: typeof TextInput; Select: typeof Select; Checkbox: typeof Checkbox; Toggle: typeof Toggle; StepSlider: typeof StepSlider; BarChart: typeof BarChart; SampleBanner: typeof SampleBanner; SampleBadge: typeof SampleBadge; StanceBlock: typeof StanceBlock; Flag: typeof Flag; SelectMark: typeof SelectMark; FlagHero: typeof FlagHero; Wordmark: typeof Wordmark; FlagUnfold: typeof FlagUnfold; PhotoFrame: typeof PhotoFrame; ShareImage: typeof ShareImage; Icon: typeof Icon; AppBar: typeof AppBar; formatCz: typeof formatCz } } }
