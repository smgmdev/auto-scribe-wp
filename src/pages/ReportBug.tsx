import { useState, useRef, useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { ArrowRight, Bug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { Search, User, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';
import bugReportHero from '@/assets/bug-report-hero.jpg';

export default function ReportBug() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      
      if (currentScrollY > lastScrollY.current && currentScrollY > 64) {
        setIsHeaderHidden(true);
      } else {
        setIsHeaderHidden(false);
      }
      
      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB.');
      return;
    }
    
    setAttachment(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !category || !description.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      let attachmentUrl: string | null = null;

      if (attachment) {
        setUploading(true);
        const fileExt = attachment.name.split('.').pop();
        const filePath = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('bug-attachments')
          .upload(filePath, attachment);

        if (uploadError) throw uploadError;

        // Store the file path, not a public URL (bucket is private)
        attachmentUrl = filePath;
        setUploading(false);
      }

      const { error } = await (supabase.from('bug_reports' as any) as any).insert({
        subject: subject.trim(),
        category,
        description: description.trim(),
        steps_to_reproduce: stepsToReproduce.trim() || null,
        reporter_email: user?.email || email.trim(),
        user_id: user?.id || null,
        attachment_url: attachmentUrl,
      });

      if (error) throw error;

      setSubmitted(true);
      toast.success('Bug report submitted successfully!');
    } catch (err) {
      console.error('Error submitting bug report:', err);
      toast.error('Failed to submit bug report. Please try again.');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <>
    <SEOHead title="Report a Bug and Get Rewards" />
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - hide on scroll like Help Center */}
      <header 
        className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-black hover:text-white"
              onClick={() => setShowSearchModal(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/account')}
                className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="rounded-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="h-[120px]" />

      <div className={`sticky z-50 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-white/90 backdrop-blur-sm">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground">Report a Bug</span>
          </div>
        </div>
        <div className="h-px bg-border" />
      </div>

      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      <main className="flex-1">
        <div className="max-w-[680px] mx-auto px-4 md:px-6 pt-6 pb-16">
          <h1 className="text-2xl md:text-3xl font-semibold mt-[100px] md:mt-[100px] mb-3">
            {submitted ? 'Thank you for your report' : 'Send Us Your Feedback and Get Rewards'}
          </h1>
          <p className="text-base text-muted-foreground mb-10">
            {submitted
              ? "We'll investigate this issue and work on a fix. If the bugs are confirmed and eligible, you'll receive free credits from the Arcana Mace team as a thank-you for your help."
              : 'Help us improve Arcana Mace by reporting any issues you encounter. Every report is reviewed, and we reward eligible reports with free credits that can be used for article publishing.'}
          </p>

          {/* Report icon */}
          {!submitted && (
            <div className="mb-14 flex items-center justify-center">
              <Bug className="h-16 w-16 text-foreground" />
            </div>
          )}

          {/* FAQ - above form */}
          {!submitted && (
            <div className="mb-14">
              
              <Accordion type="multiple" className="w-full">
                <AccordionItem value="credits" className="border-t border-border">
                  <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                    <span className="flex items-center justify-between w-full gap-3 text-left">
                      <span className="text-left">How many credits can I earn for reporting bugs?</span>
                      <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-foreground leading-relaxed pb-6 space-y-3">
                    <p>Credit rewards are determined by the severity and impact of the reported issue. Below is a general guideline for how credits are allocated:</p>
                    <p><strong className="text-foreground">1–5 credits</strong> — Minor visual or user interface issues, such as layout inconsistencies, typos, or styling problems.</p>
                    <p><strong className="text-foreground">5–10 credits</strong> — Functional or performance-related bugs, including broken features, unexpected behavior, or slow loading times.</p>
                    <p><strong className="text-foreground">10–15 credits</strong> — Issues affecting credits, payments, WordPress publishing, or site connectivity.</p>
                    <p><strong className="text-foreground">15–20 credits</strong> — Critical security vulnerabilities that could compromise user data or system integrity.</p>
                    <p className="text-sm mt-4 border-t border-border pt-4">
                      <strong className="text-foreground">Please note:</strong> The final credit amount is determined based on all submissions received for a given issue. If multiple users report the same bug, later submissions may receive fewer credits than the original reporter. Unique discoveries that have not been previously reported are rewarded at the full rate.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="usage" className="border-t border-border">
                  <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                    <span className="flex items-center justify-between w-full gap-3 text-left">
                      <span className="text-left">How can I use the credits earned from bug reporting?</span>
                      <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-foreground leading-relaxed pb-6 space-y-3">
                    <p>Credits earned through bug reporting are gifted directly to your account by the Arcana Mace team. Please ensure that you provide the email address associated with your account in the submission form so we can deliver the credits to the correct user.</p>
                    <p>These credits can be used exclusively for media publishing on the Arcana Mace platform. They cannot be withdrawn or converted into cash.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          {/* Start / Cancel Report button */}
          {!submitted && !showForm && (
            <div className="mb-10">
              <Button
                onClick={() => setShowForm(true)}
                className="w-full rounded-none bg-black text-white hover:bg-transparent hover:text-black border border-transparent hover:border-black transition-all duration-200"
              >
                Start Report
              </Button>
            </div>
          )}

          {submitted ? (
            <div className="flex justify-end mt-4">
              <Button 
                className="group rounded-none bg-black text-white hover:bg-transparent hover:text-black border border-transparent hover:border-black transition-all duration-200"
                onClick={() => { setSubmitted(false); setShowForm(false); setSubject(''); setCategory(''); setDescription(''); setStepsToReproduce(''); setEmail(''); setAttachment(null); }}
              >
                Submit Another
                <ArrowRight className="h-4 w-4 max-w-0 opacity-0 transition-all duration-200 group-hover:max-w-[16px] group-hover:ml-1 group-hover:opacity-100" />
              </Button>
            </div>
          ) : showForm ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg md:text-xl font-semibold text-foreground">Start the Report</h2>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  className="rounded-none bg-black text-white border-black hover:bg-transparent hover:text-black transition-all duration-200"
                >
                  Cancel Report
                </Button>
              </div>
              <div>
                <label className="text-sm font-medium text-[#1d1d1f] mb-1.5 block">Subject*</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of the issue"
                  className="h-8 md:h-9 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#1d1d1f] mb-1.5 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={user?.email || 'your@email.com'}
                  className="h-8 md:h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Please enter the email address associated with your account to receive bug-reporting gift credits.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-[#1d1d1f] mb-1.5 block">Category*</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 md:h-9 text-sm">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ui">UI / Visual Issue</SelectItem>
                    <SelectItem value="functionality">Broken Functionality</SelectItem>
                    <SelectItem value="performance">Performance / Speed</SelectItem>
                    <SelectItem value="publishing">Publishing / WordPress</SelectItem>
                    <SelectItem value="credits">Credits / Payments</SelectItem>
                    <SelectItem value="auth">Login / Authentication</SelectItem>
                    <SelectItem value="agency">Agency Features</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-[#1d1d1f] mb-1.5 block">Description*</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the bug in detail. What happened? What did you expect to happen?"
                  className="min-h-[100px] md:min-h-[120px] resize-none text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#1d1d1f] mb-1.5 block">Steps to Reproduce</label>
                <Textarea
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  className="min-h-[80px] md:min-h-[100px] resize-none text-sm"
                />
              </div>

              {/* Attachment */}
              <div>
                <label className="text-sm font-medium text-[#1d1d1f] mb-1.5 block">Attachment</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept="image/*,.pdf,.doc,.docx,.txt,.log"
                  className="hidden"
                />
                {attachment ? (
                  <div className="flex items-center gap-2 p-2.5 border border-border bg-muted/30">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground truncate flex-1">{attachment.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(attachment.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2 p-2.5 border border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground transition-colors text-sm"
                  >
                    <Paperclip className="h-4 w-4" />
                    <span>Attach a screenshot or file (max 10MB)</span>
                  </button>
                )}
              </div>

              <Button type="submit" disabled={submitting || uploading} className="w-full rounded-none bg-black text-white hover:bg-transparent hover:text-black border border-transparent hover:border-black transition-all duration-200 group">
                <span className="flex items-center justify-center gap-2">
                  <span className="transition-transform duration-200 group-hover:-translate-x-1">{uploading ? 'Uploading...' : submitting ? 'Submitting...' : 'Submit Bug Report'}</span>
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                </span>
              </Button>
            </form>
          ) : null}
        </div>
      </main>

      <PWAInstallButtons />
      <Footer narrow />
    </div>
    </>
  );
}
