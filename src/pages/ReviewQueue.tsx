import { useState, useEffect } from 'react';
import ReviewModal from '@/components/email-review/ReviewModal';
import IncidentTable from '@/components/dashboard/IncidentTable';
import InvestigationQueueTable from '@/components/dashboard/InvestigationQueueTable';
import { emailService } from '@/services/emailService';
import { emailUploadService } from '@/services/emailUploadService';
import type { EmailRecord, ReviewStatus, User } from '@/types';
import { mapInvestigationEmail, type InvestigationQueueEmail } from '@/utils/emailQueue';

export default function ReviewQueue({ user }: { user: User }) {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [queueEmails, setQueueEmails] = useState<InvestigationQueueEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueError, setQueueError] = useState('');
  const [selected, setSelected] = useState<EmailRecord | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (user.role === 'soc_analyst') {
      emailUploadService.list()
        .then(data => {
          if (!active) return;
          setQueueEmails(data.map(mapInvestigationEmail));
          setQueueError('');
        })
        .catch(reason => {
          if (active) setQueueError(reason instanceof Error ? reason.message : 'Could not load saved email records.');
        })
        .finally(() => { if (active) setLoading(false); });
    } else {
      emailService.getEmails()
        .then(data => {
          if (!active) return;
          setEmails(data.filter(email => email.recipient.toLowerCase() === user.email.toLowerCase()));
        })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [user.email, user.role]);

  const reloadQueue = () => {
    setLoading(true);
    setQueueError('');
    emailUploadService.list()
      .then(data => setQueueEmails(data.map(mapInvestigationEmail)))
      .catch(reason => setQueueError(reason instanceof Error ? reason.message : 'Could not load saved email records.'))
      .finally(() => setLoading(false));
  };

  const handleAction = async (emailId: string, status: ReviewStatus) => {
    await emailService.updateReviewStatus(emailId, status);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, reviewStatus: status } : e));
  };

  const isAnalystQueue = user.role === 'soc_analyst';
  const pending = emails.filter(e => isAnalystQueue
    ? e.reviewStatus === 'analyst_review'
    : e.reviewStatus === 'pending');

  if (isAnalystQueue) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Investigation Queue</h1>
          <p className="mt-1 text-sm text-slate-400">
            {queueEmails.length} saved email{queueEmails.length !== 1 ? 's' : ''} in your organization.
          </p>
        </div>
        <InvestigationQueueTable
          emails={queueEmails}
          loading={loading}
          error={queueError}
          onRetry={reloadQueue}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">{isAnalystQueue ? 'Investigation Queue' : 'Email Reviews'}</h1>
        <p className="text-sm text-slate-400 mt-1">
          {pending.length} email{pending.length !== 1 ? 's' : ''} awaiting {isAnalystQueue ? 'analyst review' : 'your review'}.
        </p>
      </div>

      <IncidentTable emails={emails} loading={loading} onViewEmail={setSelected} />

      {selected && (
        <ReviewModal
          email={selected}
          onClose={() => setSelected(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
