import { useState, useRef } from 'react';
import { Sparkles, Upload, X, Image as ImageIcon, Send, Loader2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { ArticleTone, FeaturedImage } from '@/types';

const toneOptions: { value: ArticleTone; label: string; color: string }[] = [
  { value: 'political', label: 'Political', color: 'bg-headline-political' },
  { value: 'business', label: 'Business', color: 'bg-headline-business' },
  { value: 'financial', label: 'Financial', color: 'bg-headline-financial' },
  { value: 'crypto', label: 'Crypto', color: 'bg-headline-crypto' },
  { value: 'realestate', label: 'Real Estate', color: 'bg-headline-realestate' },
];

export function ComposeView() {
  const { selectedHeadline, setSelectedHeadline, sites, addArticle } = useAppStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [tone, setTone] = useState<ArticleTone>('business');
  const [title, setTitle] = useState(selectedHeadline?.title || '');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [featuredImage, setFeaturedImage] = useState<FeaturedImage>({
    file: null,
    title: '',
    caption: '',
    altText: '',
    description: '',
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFeaturedImage({ ...featuredImage, file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setFeaturedImage({
      file: null,
      title: '',
      caption: '',
      altText: '',
      description: '',
    });
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!title && !selectedHeadline) {
      toast({
        title: "Title required",
        description: "Please enter or select a headline first",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    // Simulate AI generation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Generate rewritten headline based on original
    const rewrittenTitles: Record<string, Record<string, string>> = {
      political: {
        default: "Strategic Policy Shifts Reshape Global Economic Landscape",
        ecb: "Central Banking Decisions Set to Transform European Monetary Policy",
        tech: "Technology Sector Faces New Regulatory Scrutiny Amid Political Pressure",
        crypto: "Cryptocurrency Regulation Emerges as Key Political Battleground",
        realestate: "Housing Policy Reforms Signal Major Shift in Government Priorities",
      },
      business: {
        default: "Market Leaders Navigate Unprecedented Industry Transformation",
        ecb: "Banking Sector Braces for Impact as Rate Decisions Loom",
        tech: "Technology Giants Redefine Corporate Strategy in Challenging Climate",
        crypto: "Digital Asset Companies Pivot Strategies Amid Market Evolution",
        realestate: "Commercial Real Estate Sector Adapts to Shifting Market Dynamics",
      },
      financial: {
        default: "Investment Strategies Evolve as Market Conditions Shift",
        ecb: "Rate Expectations Drive Significant Portfolio Rebalancing",
        tech: "Technology Valuations Face Renewed Scrutiny from Institutional Investors",
        crypto: "Digital Asset Allocations Gain Traction Among Traditional Fund Managers",
        realestate: "Property Market Fundamentals Signal Turning Point for Investors",
      },
      crypto: {
        default: "Blockchain Adoption Accelerates Across Traditional Finance",
        ecb: "Central Bank Digital Currency Developments Reshape Crypto Landscape",
        tech: "Web3 Infrastructure Investments Surge Amid Institutional Interest",
        crypto: "Decentralized Finance Protocols See Record Growth in User Adoption",
        realestate: "Tokenized Real Estate Emerges as Bridge Between Traditional and Digital Assets",
      },
      realestate: {
        default: "Property Markets Enter New Phase of Cyclical Adjustment",
        ecb: "Interest Rate Trajectory Crucial for Housing Market Recovery",
        tech: "PropTech Innovation Transforms Commercial Leasing Landscape",
        crypto: "Blockchain-Based Property Transactions Gain Regulatory Approval",
        realestate: "Residential Market Stabilization Signals New Investment Opportunities",
      },
    };

    const titleKey = selectedHeadline?.title.toLowerCase().includes('rate') ? 'ecb' 
      : selectedHeadline?.title.toLowerCase().includes('tech') ? 'tech'
      : selectedHeadline?.title.toLowerCase().includes('crypto') ? 'crypto'
      : selectedHeadline?.title.toLowerCase().includes('real estate') ? 'realestate'
      : 'default';

    const newTitle = rewrittenTitles[tone]?.[titleKey] || rewrittenTitles[tone]?.default || title;
    setTitle(newTitle);
    
    // Generate ~700 word article
    const generatedContent = `The current state of affairs in the ${tone} sector presents a fascinating study in adaptation and resilience. As market participants grapple with shifting fundamentals and evolving consumer expectations, the contours of a new landscape are beginning to emerge with increasing clarity.

Industry veterans point to several factors driving these changes. The acceleration of digital transformation, coupled with evolving regulatory frameworks, has created an environment where traditional playbooks no longer guarantee success. Organizations that once dominated their respective niches now find themselves competing against nimble challengers armed with innovative approaches and unburdened by legacy constraints.

The data tells a compelling story. Recent quarters have witnessed significant realignment across key metrics, with leaders emerging in unexpected places. While established players continue to command substantial market presence, their grip has loosened perceptibly. This democratization of opportunity has injected fresh dynamism into sectors that had grown accustomed to predictable patterns.

Analysts tracking these developments emphasize the importance of strategic flexibility. The companies thriving in this environment share common characteristics: a willingness to question established assumptions, investments in capabilities that may not yield immediate returns, and an organizational culture that embraces calculated risk-taking. These attributes, while difficult to cultivate, have proven essential for navigating current conditions.

The human element remains central to this transformation. Behind the statistics and trend lines are decisions made by individuals responding to pressures both professional and personal. Understanding these motivations provides crucial context for interpreting market movements that might otherwise appear random or contradictory.

Looking at specific developments, several themes deserve attention. The intersection of technology and traditional business models continues to generate friction and opportunity in equal measure. Companies that successfully bridge these worlds have discovered significant competitive advantages, while those struggling to adapt face mounting pressure from multiple directions.

Geographic considerations add another layer of complexity. Regional variations in regulatory approach, consumer behavior, and competitive intensity mean that strategies effective in one market may falter elsewhere. This reality demands a nuanced understanding of local conditions alongside awareness of global trends.

The role of capital allocation cannot be overstated. Investment decisions made today will shape competitive dynamics for years to come. Organizations with access to patient capital find themselves better positioned to weather short-term disruptions while building foundations for long-term success. This advantage compounds over time, creating durable moats that prove difficult for less well-resourced competitors to breach.

Sustainability considerations have moved from peripheral concern to central strategic imperative. Stakeholders across the spectrum now demand credible commitments to environmental and social responsibility. Companies that view these expectations as mere compliance burdens risk alienating customers, employees, and investors who increasingly factor such considerations into their decisions.

The regulatory landscape deserves particular attention. Policymakers worldwide are grappling with questions that technological advancement has rendered newly urgent. Their conclusions will establish parameters within which businesses must operate for the foreseeable future. Proactive engagement with these processes represents both opportunity and necessity.

Looking forward, several scenarios merit consideration. The base case envisions continued gradual evolution, with current trends extending in broadly predictable fashion. Alternative paths might see acceleration or reversal of key dynamics, depending on developments that remain uncertain. Prudent planning requires preparation for multiple contingencies.

Market participants seeking to position themselves advantageously would do well to focus on fundamentals. While tactical considerations matter, sustainable success ultimately derives from delivering genuine value to stakeholders. Organizations that lose sight of this principle in pursuit of short-term gains often find themselves struggling when conditions shift.

The coming period promises continued evolution and occasional disruption. Those who approach it with clear eyes, flexible strategies, and genuine commitment to excellence stand the best chance of emerging stronger. The challenges are substantial, but so too are the opportunities for those prepared to seize them.

As stakeholders across the ecosystem assess their positions and chart paths forward, the importance of informed perspective becomes increasingly apparent. The complexity of current conditions rewards those who invest in understanding before acting. Patience, while perhaps unfashionable, remains a virtue worth cultivating.`;

    setContent(generatedContent);
    setIsGenerating(false);
    
    toast({
      title: "Article generated",
      description: "700-word article with rewritten headline ready for review",
    });
  };

  const handlePublish = () => {
    if (!title || !content) {
      toast({
        title: "Missing content",
        description: "Please generate or write article content first",
        variant: "destructive",
      });
      return;
    }

    if (selectedSites.length === 0) {
      toast({
        title: "No sites selected",
        description: "Please select at least one WordPress site to publish to",
        variant: "destructive",
      });
      return;
    }

    addArticle({
      id: crypto.randomUUID(),
      title,
      content,
      tone,
      sourceHeadline: selectedHeadline || undefined,
      featuredImage: featuredImage.file ? featuredImage : undefined,
      status: 'published',
      publishedTo: selectedSites,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    toast({
      title: "Article published",
      description: `Successfully published to ${selectedSites.length} site(s)`,
    });

    // Reset form
    setTitle('');
    setContent('');
    setSelectedHeadline(null);
    setSelectedSites([]);
    removeImage();
  };

  const handleSaveDraft = () => {
    if (!title) {
      toast({
        title: "Title required",
        description: "Please enter a title for your draft",
        variant: "destructive",
      });
      return;
    }

    addArticle({
      id: crypto.randomUUID(),
      title,
      content,
      tone,
      sourceHeadline: selectedHeadline || undefined,
      featuredImage: featuredImage.file ? featuredImage : undefined,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    toast({
      title: "Draft saved",
      description: "Your article has been saved as a draft",
    });
  };

  const toggleSite = (siteId: string) => {
    setSelectedSites(prev => 
      prev.includes(siteId) 
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-4xl font-bold text-foreground">
          Compose Article
        </h1>
        <p className="mt-2 text-muted-foreground">
          Write or generate AI-powered articles for your WordPress sites
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Selected Headline */}
          {selectedHeadline && (
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Based on headline from</p>
                  <p className="font-medium text-sm">{selectedHeadline.source}.com</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setSelectedHeadline(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Article Title</Label>
            <Input
              id="title"
              placeholder="Enter your article title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-display"
            />
          </div>

          {/* Tone Selection */}
          <div className="space-y-2">
            <Label>Article Tone</Label>
            <div className="flex flex-wrap gap-2">
              {toneOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant={tone === option.value ? 'default' : 'outline'}
                  className={`cursor-pointer transition-all ${
                    tone === option.value 
                      ? `${option.color} text-white border-transparent` 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setTone(option.value)}
                >
                  {option.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button 
            variant="accent" 
            className="w-full"
            onClick={handleGenerate}
            disabled={isGenerating || !title}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Article with AI
              </>
            )}
          </Button>

          {/* Content Editor */}
          <div className="space-y-2">
            <Label htmlFor="content">Article Content</Label>
            <Textarea
              id="content"
              placeholder="Your article content will appear here after generation, or you can write manually..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[400px] font-body text-base leading-relaxed"
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Featured Image */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Featured Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              {imagePreview ? (
                <div className="relative">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={removeImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-accent/5 transition-colors"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Upload Image</span>
                </button>
              )}

              {imagePreview && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="img-title" className="text-xs">Image Title</Label>
                    <Input
                      id="img-title"
                      placeholder="Image title"
                      value={featuredImage.title}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, title: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="img-alt" className="text-xs">Alt Text</Label>
                    <Input
                      id="img-alt"
                      placeholder="Alt text for accessibility"
                      value={featuredImage.altText}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, altText: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="img-caption" className="text-xs">Caption</Label>
                    <Input
                      id="img-caption"
                      placeholder="Image caption"
                      value={featuredImage.caption}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, caption: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="img-desc" className="text-xs">Description</Label>
                    <Textarea
                      id="img-desc"
                      placeholder="Image description"
                      value={featuredImage.description}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, description: e.target.value })}
                      className="min-h-[60px] text-sm"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Publish To */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Publish To</CardTitle>
            </CardHeader>
            <CardContent>
              {sites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No WordPress sites connected. Add a site first.
                </p>
              ) : (
                <div className="space-y-2">
                  {sites.map((site) => (
                    <label 
                      key={site.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSites.includes(site.id)
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSites.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        selectedSites.includes(site.id)
                          ? 'bg-accent border-accent'
                          : 'border-muted-foreground/30'
                      }`}>
                        {selectedSites.includes(site.id) && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12">
                            <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium">{site.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-3">
            <Button 
              variant="accent" 
              className="w-full"
              onClick={handlePublish}
              disabled={!content || selectedSites.length === 0}
            >
              <Send className="mr-2 h-4 w-4" />
              Publish Article
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleSaveDraft}
              disabled={!title}
            >
              Save as Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
