import { useState } from 'react';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { SliderPuzzleCaptcha } from '@/components/auth/SliderPuzzleCaptcha';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface InvestorContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvestorContactForm({ open, onOpenChange }: InvestorContactFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [investorType, setInvestorType] = useState('');
  const [message, setMessage] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValid = fullName.trim() && email.trim() && mobileNumber.trim() && investorType;

  const handleSendRequest = () => {
    if (!isValid) {
      toast.error('Please fill in all required fields');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }
    setShowCaptcha(true);
  };

  const handleCaptchaVerified = async () => {
    setShowCaptcha(false);
    setSubmitting(true);
    try {
      const payload: Record<string, string> = {
        full_name: fullName.trim(),
        email: email.trim(),
        mobile_number: mobileNumber.trim(),
        investor_type: investorType,
      };
      if (message.trim()) payload.message = message.trim();

      const { error } = await supabase.from('investor_contact_requests' as any).insert(payload);
      if (error) throw error;

      const { error: emailError } = await supabase.functions.invoke('send-investor-contact', {
        body: payload,
      });
      if (emailError) console.error('Email notification failed:', emailError);

      toast.success('Your inquiry has been submitted. We will be in touch.');
      setFullName('');
      setEmail('');
      setMobileNumber('');
      setInvestorType('');
      setMessage('');
      onOpenChange(false);
    } catch {
      toast.error('Failed to submit inquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (val: boolean) => {
    if (!val) setShowCaptcha(false);
    onOpenChange(val);
  };

  return (
    <DraggablePopup
      open={open}
      onOpenChange={handleClose}
      title={<h2 className="text-lg font-bold">Investor Inquiry</h2>}
      width={440}
      zIndex={250}
      footer={
        !showCaptcha ? (
          <Button
            onClick={handleSendRequest}
            disabled={!isValid || submitting}
            className="w-full rounded-none bg-black text-white hover:bg-transparent hover:text-black hover:border-black border border-transparent h-12 text-base font-medium transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit Inquiry
          </Button>
        ) : undefined
      }
    >
      {showCaptcha ? (
        <div className="py-4">
          <SliderPuzzleCaptcha
            onVerified={handleCaptchaVerified}
            onCancel={() => setShowCaptcha(false)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="investor-name" className="text-sm font-medium">Full Name *</Label>
            <Input
              id="investor-name"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
              className="rounded-none !text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="investor-email" className="text-sm font-medium">Email *</Label>
            <Input
              id="investor-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              className="rounded-none !text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="investor-mobile" className="text-sm font-medium">Mobile Number *</Label>
            <Input
              id="investor-mobile"
              type="tel"
              placeholder="Enter your mobile number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              maxLength={20}
              className="rounded-none !text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Investor Type *</Label>
            <Select value={investorType} onValueChange={setInvestorType}>
              <SelectTrigger className="rounded-none !text-sm">
                <SelectValue placeholder="Select investor type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Venture Capital">Venture Capital</SelectItem>
                <SelectItem value="Private Equity">Private Equity</SelectItem>
                <SelectItem value="Angel Investor">Angel Investor</SelectItem>
                <SelectItem value="Family Office">Family Office</SelectItem>
                <SelectItem value="Institutional Investor">Institutional Investor</SelectItem>
                <SelectItem value="Corporate / Strategic">Corporate / Strategic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="investor-message" className="text-sm font-medium">Message (Optional)</Label>
            <Textarea
              id="investor-message"
              placeholder="Tell us about your investment interest..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              className="rounded-none !text-sm min-h-[80px]"
            />
          </div>
        </div>
      )}
    </DraggablePopup>
  );
}
