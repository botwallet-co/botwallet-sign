import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, HelpCircle, Lock, ShieldCheck } from 'lucide-react';
import type { SigningIntentDetails } from '../../lib/api';
import type { ActionKind } from '../../lib/action';
import { summarizeFees } from '../../lib/format';
import MnemonicInput from '../MnemonicInput';
import { Button, CancelLink, StageHeading } from '../ui';
import ExpiryNote from './ExpiryNote';

function KeyHelp({ dashboardUrl }: { dashboardUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-warm-gray hover:text-warm-black transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Where do I find Key 1?
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-cream rounded-lg text-xs text-warm-gray leading-relaxed space-y-1.5 animate-fade-in">
          <p>
            Your agent has it. In the{' '}
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-warm-black underline underline-offset-2"
            >
              Botwallet dashboard
            </a>
            , open the wallet, then ⋮ → Backup Keys, to get a message you can send your agent.
          </p>
          <p>If you saved your backup, Key 1 is its first 12 words. Never enter Key 2 on this page.</p>
        </div>
      )}
    </div>
  );
}

interface Props {
  details: SigningIntentDetails;
  kind: ActionKind;
  /** MnemonicInput accepted Key 1, so Sign & Submit is on. */
  keyReady: boolean;
  deadline: number | null;
  now: number;
  expired: boolean;
  dashboardUrl: string;
  onBack: () => void;
  onKeyValid: (mnemonic: string) => void;
  onKeyReset: () => void;
  onSign: () => void;
}

/** Step 2: Key 1, then signing. SigningFlow puts it in StepFrame's card, with KeyStepNote below. */
export default function KeyStep({
  details, kind, keyReady, deadline, now, expired, dashboardUrl, onBack, onKeyValid, onKeyReset, onSign,
}: Props) {
  const totalUsdc = summarizeFees(details).total ?? '—';

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-warm-gray-light uppercase tracking-[0.12em]">
          Step 2 of 2
        </p>
        <button
          onClick={onBack}
          className="text-xs text-warm-gray-light hover:text-warm-black transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
      </div>
      <StageHeading className="text-xl font-semibold text-warm-black mb-1.5">
        Confirm with Key 1
      </StageHeading>
      <p className="text-sm text-warm-gray mb-3 leading-relaxed">
        Enter Key 1, the 12 words your agent keeps, to authorize this {kind}{' '}
        (<span className="font-mono font-medium text-warm-black">${totalUsdc}</span> USDC in total).
        The words are checked in this browser and never sent anywhere.
      </p>

      <KeyHelp dashboardUrl={dashboardUrl} />

      <div className="inline-flex items-center gap-1.5 bg-cream rounded-full px-3.5 py-1.5 mb-5 text-[13px] text-warm-black font-medium">
        <Lock className="w-3 h-3 text-warm-gray" />
        ${totalUsdc} USDC total
      </div>

      <p className="flex items-center gap-1.5 text-xs text-warm-gray mb-3">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        Only enter these words on sign.botwallet.co.
      </p>

      <MnemonicInput
        onValid={onKeyValid}
        onReset={onKeyReset}
        disabled={expired}
      />

      <Button
        onClick={onSign}
        disabled={!keyReady || expired}
        className="w-full mt-5 transition-all"
      >
        <ShieldCheck className="w-4 h-4" />
        Sign & Submit
      </Button>

      <CancelLink href={dashboardUrl} />

      <div className="mt-4 text-center text-[11px] text-warm-gray-light">
        <ExpiryNote deadline={deadline} now={now} kind={kind} />
      </div>
    </>
  );
}

/** Under the Key 1 step's card. */
export function KeyStepNote() {
  return (
    <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-warm-gray-light">
      <Lock className="w-3 h-3" />
      <span>Processed locally · Never sent to any server</span>
    </div>
  );
}
