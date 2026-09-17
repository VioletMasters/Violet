import { ArrowLeft, ArrowRight, BarChart3, Check, CircleDollarSign, PackagePlus, Sparkles, Store } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const STARTER_TUTORIAL_ACTION_EVENT = "violet:starter-tutorial-action";

export type StarterTutorialProps = {
  /** Controls whether the tutorial dialog is visible. */
  open: boolean;
  /** Called for both the close button and the Escape/backdrop dismissal. */
  onOpenChange: (open: boolean) => void;
  /** Zero-based active step: 0 product, 1 cashier day, 2 reports. */
  activeStep: number;
  /** Changes the visible tutorial step. */
  onStepChange: (step: number) => void;
  /** Navigates to an existing Violet workspace route and reports whether navigation proceeded immediately. */
  onNavigate: (path: string) => boolean;
  /** Called when the operator finishes the tutorial from the final step. */
  onComplete: () => void;
};

type TutorialStep = {
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  action: string;
  route: string;
  icon: typeof PackagePlus;
  accent: string;
  surface: string;
  bullets: string[];
};

const steps: TutorialStep[] = [
  {
    eyebrow: "01 / Stock the shelf",
    title: "Create your first product",
    description:
      "Add the item your customers ask for most. Once it is saved, it is ready to ring up at the counter.",
    detail: "Products keeps prices, stock, and barcode details together.",
    action: "Go to Products",
    route: "/products",
    icon: PackagePlus,
    accent: "text-[#6147c7] dark:text-[#b8a8ff]",
    surface: "bg-[#e9e2ff] dark:bg-[#332850]",
    bullets: ["Give it a clear name and selling price", "Add stock so the counter knows it is available"],
  },
  {
    eyebrow: "02 / Open the counter",
    title: "Start and cash out a cashier day",
    description:
      "Open the register with an opening float, serve customers, then settle the day without leaving the counter guessing.",
    detail: "Settlement is reached from the account menu in the top-right corner.",
    action: "Open Point of Sale",
    route: "/pos",
    icon: CircleDollarSign,
    accent: "text-[#bb5c3f] dark:text-[#ffab8d]",
    surface: "bg-[#ffe4d8] dark:bg-[#4a2d31]",
    bullets: ["Start the cashier day before the first sale", "Use the account menu to clock out and settle"],
  },
  {
    eyebrow: "03 / Know your day",
    title: "Review reports with confidence",
    description:
      "See what sold, how the drawer performed, and where the store is moving. Violet turns the day's activity into a quick read.",
    detail: "Reports are built for the owner’s next decision, not a wall of admin controls.",
    action: "View Reports",
    route: "/reports",
    icon: BarChart3,
    accent: "text-[#2f806d] dark:text-[#8fe0c7]",
    surface: "bg-[#dcefe7] dark:bg-[#23453d]",
    bullets: ["Scan sales and tender totals at a glance", "Use the trend to plan the next order"],
  },
];

export function StarterTutorial({
  open,
  onOpenChange,
  activeStep,
  onStepChange,
  onNavigate,
  onComplete,
}: StarterTutorialProps) {
  const currentIndex = Math.min(Math.max(Math.trunc(activeStep), 0), steps.length - 1);
  const step = steps[currentIndex];
  const StepIcon = step.icon;
  const isFinalStep = currentIndex === steps.length - 1;

  const goToStep = (index: number) => {
    onStepChange(index);
  };

  const handlePrimaryAction = () => {
    const didNavigate = onNavigate(step.route);
    if (isFinalStep && didNavigate) onComplete();
  };

  const handleNext = () => {
    if (isFinalStep) {
      onComplete();
      return;
    }
    onStepChange(currentIndex + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="starter-tutorial-description"
        className="max-w-[920px] gap-0 overflow-hidden border-[#ded6ce] bg-[#f6f2ea] p-0 text-[#2b2634] shadow-[0_24px_80px_rgba(55,39,79,0.22)] dark:border-[#423652] dark:bg-[#1f1a2d] dark:text-[#f6f0e9] sm:rounded-[24px]"
      >
        <div className="relative grid min-h-[min(650px,calc(100dvh-2rem))] md:grid-cols-[260px_1fr]">
          <aside className="relative overflow-hidden bg-[#302448] px-5 pb-5 pt-6 text-[#f4eee6] md:px-6 md:pb-7 md:pt-8">
            <div
              aria-hidden="true"
              className="absolute -right-16 -top-20 h-48 w-48 rounded-full border-[22px] border-[#e9a27e]/20"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full border-[22px] border-[#8ed4bd]/15"
            />

            <div className="relative">
              <div className="mb-8 flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3b08b] text-[#302448] shadow-sm">
                  <Store className="h-[18px] w-[18px]" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="font-display text-base font-semibold tracking-[-0.02em]">Violet</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#c4b8d0]">
                    First shift guide
                  </p>
                </div>
              </div>

              <p className="mb-5 max-w-[185px] font-display text-[1.55rem] font-medium leading-[1.08] tracking-[-0.04em]">
                A calm start at the counter.
              </p>
              <p className="mb-8 max-w-[200px] text-xs leading-5 text-[#c9bfd1]">
                Three small moves to get your store ready for its next customer.
              </p>

              <nav aria-label="Starter tutorial steps" className="space-y-2">
                {steps.map((item, index) => {
                  const ItemIcon = item.icon;
                  const isActive = currentIndex === index;
                  const isComplete = currentIndex > index;

                  return (
                    <button
                      key={item.eyebrow}
                      type="button"
                      data-testid={`button-tutorial-step-${index + 1}`}
                      aria-current={isActive ? "step" : undefined}
                      onClick={() => goToStep(index)}
                      className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3b08b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#302448] ${
                        isActive
                          ? "bg-[#f6f2ea] text-[#302448] shadow-[0_8px_24px_rgba(18,12,31,0.16)] dark:bg-[#f0e7dc]"
                          : "text-[#cfc6d7] hover:-translate-y-0.5 hover:bg-[#45365b] hover:text-[#fffaf3]"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          isActive
                            ? "bg-[#e9e2ff] text-[#6147c7]"
                            : isComplete
                              ? "bg-[#8ed4bd] text-[#24493e]"
                              : "bg-[#49395e] text-[#dacfe3]"
                        }`}
                      >
                        {isComplete ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <ItemIcon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                          Step {index + 1}
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-medium">{item.title}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col px-5 pb-5 pt-8 sm:px-8 sm:pb-7 sm:pt-9 md:px-10">
            <DialogHeader className="pr-8 text-left">
              <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#756b78] dark:text-[#afa4b5]">
                <Sparkles className="h-3.5 w-3.5 text-[#bb5c3f] dark:text-[#ffab8d]" />
                <span data-testid="text-tutorial-progress">
                  {currentIndex + 1} of {steps.length} · Your first shift
                </span>
              </div>
              <DialogTitle className="max-w-[560px] font-display text-[clamp(2rem,5vw,3.65rem)] font-medium leading-[0.98] tracking-[-0.055em] text-[#302448] dark:text-[#f6f0e9]">
                {step.title}
              </DialogTitle>
              <DialogDescription
                id="starter-tutorial-description"
                data-testid={`text-tutorial-description-${currentIndex + 1}`}
                className="mt-5 max-w-[560px] text-[15px] leading-6 text-[#6f6672] dark:text-[#bdb2c2]"
              >
                {step.description}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-7 flex-1">
              <div className={`relative overflow-hidden rounded-[20px] p-5 sm:p-6 ${step.surface}`}>
                <div
                  aria-hidden="true"
                  className="absolute -right-9 -top-10 h-32 w-32 rounded-full border-[16px] border-[#f6f2ea]/45 dark:border-[#f6f0e9]/10"
                />
                <div className="relative">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f6f2ea]/75 shadow-sm dark:bg-[#f6f0e9]/10 ${step.accent}`}>
                      <StepIcon className="h-6 w-6" strokeWidth={1.8} />
                    </div>
                    <span className="rounded-full bg-[#f6f2ea]/65 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5d5363] dark:bg-[#f6f0e9]/10 dark:text-[#d9cedd]">
                      {step.eyebrow.split(" / ")[1]}
                    </span>
                  </div>
                  <p className="max-w-[520px] text-sm font-medium leading-6 text-[#403747] dark:text-[#efe7ef]">
                    {step.detail}
                  </p>
                  <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    {step.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-xs leading-5 text-[#625869] dark:text-[#d2c6d3]">
                        <span className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#f6f2ea]/80 ${step.accent} dark:bg-[#f6f0e9]/15`}>
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {currentIndex === 1 && (
                <div
                  data-testid="text-settlement-account-menu-note"
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#ead9ce] bg-[#fff8f2]/70 px-3.5 py-3 text-xs leading-5 text-[#715e5d] dark:border-[#563e42] dark:bg-[#3c2935]/50 dark:text-[#d8bdba]"
                >
                  <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-[#bb5c3f] dark:text-[#ffab8d]" />
                  <span>
                    <strong className="font-semibold text-[#5f4545] dark:text-[#f0d1c7]">Where settlement lives:</strong> open
                    the account menu in the top-right corner after your shift, then choose “Clock out &amp; settle.”
                  </span>
                </div>
              )}
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[#ded6ce] pt-5 dark:border-[#423652] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5" aria-label="Tutorial progress">
                {steps.map((item, index) => (
                  <button
                    key={`dot-${item.eyebrow}`}
                    type="button"
                    data-testid={`button-tutorial-dot-${index + 1}`}
                    aria-label={`Go to step ${index + 1}: ${item.title}`}
                    aria-current={currentIndex === index ? "step" : undefined}
                    onClick={() => goToStep(index)}
                    className={`h-2 rounded-full transition-[width,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6147c7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f2ea] dark:focus-visible:ring-offset-[#1f1a2d] ${
                      currentIndex === index ? "w-7 bg-[#6147c7]" : "w-2 bg-[#c9c0ca] hover:bg-[#a69aad] dark:bg-[#5c4d69] dark:hover:bg-[#82718f]"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-end gap-2.5">
                {currentIndex > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="button-tutorial-previous"
                    onClick={() => onStepChange(currentIndex - 1)}
                    className="h-10 gap-2 rounded-xl px-3 text-[#6f6672] hover:bg-[#ebe4dc] hover:text-[#302448] dark:text-[#bdb2c2] dark:hover:bg-[#302448] dark:hover:text-[#f6f0e9]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  data-testid="button-tutorial-primary"
                  onClick={handlePrimaryAction}
                  className="h-10 gap-2 rounded-xl bg-[#6147c7] px-4 text-[#f8f3eb] shadow-[0_6px_16px_rgba(97,71,199,0.2)] hover:bg-[#5139ae] focus-visible:ring-2 focus-visible:ring-[#6147c7] focus-visible:ring-offset-2 dark:bg-[#8067e8] dark:text-[#21192e] dark:hover:bg-[#947df0]"
                >
                  {step.action}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="button-tutorial-next"
                  onClick={handleNext}
                  className="h-10 rounded-xl px-3 text-[#6f6672] hover:bg-[#ebe4dc] hover:text-[#302448] dark:text-[#bdb2c2] dark:hover:bg-[#302448] dark:hover:text-[#f6f0e9]"
                >
                  {isFinalStep ? "Finish" : "Next"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}