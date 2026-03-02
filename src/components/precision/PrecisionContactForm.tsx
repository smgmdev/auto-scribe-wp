import { useState } from 'react';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { SliderPuzzleCaptcha } from '@/components/auth/SliderPuzzleCaptcha';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface PrecisionContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrecisionContactForm({ open, onOpenChange }: PrecisionContactFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [organizationType, setOrganizationType] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValid = fullName.trim() && email.trim() && mobileNumber.trim() && organizationType;

  const handleSendRequest = () => {
    if (!isValid) {
      toast.error('Please fill in all fields');
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
      const payload = {
        full_name: fullName.trim(),
        email: email.trim(),
        mobile_number: mobileNumber.trim(),
        organization_type: organizationType,
      };

      // Save to database
      const { error } = await supabase.from('precision_contact_requests').insert(payload);
      if (error) throw error;

      // Send notification email
      const { error: emailError } = await supabase.functions.invoke('send-precision-contact', {
        body: payload,
      });
      if (emailError) console.error('Email notification failed:', emailError);

      toast.success('Request sent successfully. We will be in touch.');
      setFullName('');
      setEmail('');
      setMobileNumber('');
      setOrganizationType('');
      onOpenChange(false);
    } catch {
      toast.error('Failed to send request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setShowCaptcha(false);
    }
    onOpenChange(val);
  };

  return (
    <DraggablePopup
      open={open}
      onOpenChange={handleClose}
      title={<h2 className="text-lg font-bold">Interest in Arcana Precision</h2>}
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
            Send Request
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
            <Label htmlFor="precision-name" className="text-sm font-medium">Full Name</Label>
            <Input
              id="precision-name"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
              className="rounded-none !text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="precision-email" className="text-sm font-medium">Email</Label>
            <Input
              id="precision-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              className="rounded-none !text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="precision-mobile" className="text-sm font-medium">Mobile Number</Label>
            <Input
              id="precision-mobile"
              type="tel"
              placeholder="Enter your mobile number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              maxLength={20}
              className="rounded-none !text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Select Your Body</Label>
            <Select value={organizationType} onValueChange={setOrganizationType}>
              <SelectTrigger className="rounded-none !text-sm">
                <SelectValue placeholder="Select your body" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Government">Government</SelectItem>
                <SelectItem value="Semi Government Agency">Semi Government Agency</SelectItem>
                <SelectItem value="Enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </DraggablePopup>
  );
}
