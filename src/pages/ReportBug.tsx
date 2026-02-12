import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Footer } from '@/components/layout/Footer';
import { Search, User, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !category || !description.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }

    if (!user && !email.trim()) {
      toast.error('Please provide your email address.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await (supabase.from('bug_reports' as any) as any).insert({
        subject: subject.trim(),
        category,
        description: description.trim(),
        steps_to_reproduce: stepsToReproduce.trim() || null,
        reporter_email: user?.email || email.trim(),
        user_id: user?.id || null,
      });

      if (error) throw error;

      setSubmitted(true);
      toast.success('Bug report submitted successfully!');
    } catch (err) {
      console.error('Error submitting bug report:', err);
      toast.error('Failed to submit bug report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          {/* Right side buttons */}
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
                onClick={() => navigate('/dashboard')}
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

      {/* Spacer for fixed header */}
      <div className="h-[120px]" />

      {/* Sub-header - Sticky with transition like Help Center */}
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
        <div className="max-w-[680px] mx-auto px-4 md:px-6 pt-16 pb-16">
          <p className="text-sm text-muted-foreground mb-10">
            Help us improve Arcana Mace by reporting issues you encounter. We review every report.
          </p>

          {submitted ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 bg-[#1d1d1f] flex items-center justify-center mx-auto mb-4">
                <Send className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-[#1d1d1f] mb-2">Thank you for your report</h2>
              <p className="text-sm text-muted-foreground mb-6">
                We'll investigate this issue and work on a fix. You may be contacted for more details.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => { setSubmitted(false); setSubject(''); setCategory(''); setDescription(''); setStepsToReproduce(''); setEmail(''); }}>
                  Submit Another
                </Button>
                <Button onClick={() => navigate('/')}>
                  Back to Home
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] mb-1.5 block">Subject *</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of the issue"
                  className="h-9"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] mb-1.5 block">Category *</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9">
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
                <label className="text-xs font-medium text-[#1d1d1f] mb-1.5 block">Description *</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the bug in detail. What happened? What did you expect to happen?"
                  className="min-h-[120px] resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] mb-1.5 block">Steps to Reproduce</label>
                <Textarea
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  className="min-h-[100px] resize-none"
                />
              </div>

              {!user && (
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] mb-1.5 block">Your Email *</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="h-9"
                  />
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Submitting...' : 'Submit Bug Report'}
              </Button>
            </form>
          )}
        </div>
      </main>

      <Footer narrow />
    </div>
  );
}
