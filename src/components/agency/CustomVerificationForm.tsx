import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { COUNTRIES } from '@/constants/countries';


interface CustomVerificationFormProps {
  agencyPayoutId: string;
  agencyName: string;
  onSubmitSuccess: () => void;
}

const USDT_NETWORKS = [
  { value: 'TRC20', label: 'TRC20 (Tron)' },
  { value: 'ERC20', label: 'ERC20 (Ethereum)' },
  { value: 'BEP20', label: 'BEP20 (BNB Chain)' },
  { value: 'SOL', label: 'Solana' },
];

export function CustomVerificationForm({ agencyPayoutId, agencyName, onSubmitSuccess }: CustomVerificationFormProps) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  
  // File upload states
  const [companyDocsFile, setCompanyDocsFile] = useState<File | null>(null);
  const [companyDocsUrl, setCompanyDocsUrl] = useState<string | null>(null);
  const [uploadingCompanyDocs, setUploadingCompanyDocs] = useState(false);
  
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const [uploadingPassport, setUploadingPassport] = useState(false);
  
  const [articlesFile, setArticlesFile] = useState<File | null>(null);
  const [articlesUrl, setArticlesUrl] = useState<string | null>(null);
  const [uploadingArticles, setUploadingArticles] = useState(false);
  
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [uploadingLicense, setUploadingLicense] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    company_name: agencyName || '',
    country: '',
    phone: '',
    // Bank details
    bank_account_holder: '',
    bank_account_number: '',
    bank_name: '',
    bank_swift_code: '',
    bank_iban: '',
    bank_country: '',
    // Crypto details
    usdt_wallet_address: '',
    usdt_network: '',
  });

  const handleFileUpload = async (
    file: File,
    type: 'company' | 'passport' | 'articles' | 'license',
    setUploading: (val: boolean) => void,
    setUrl: (url: string | null) => void
  ) => {
    if (!user) return;

    const maxSizes: Record<string, number> = {
      passport: 2 * 1024 * 1024,
      company: 5 * 1024 * 1024,
      articles: 5 * 1024 * 1024,
      license: 5 * 1024 * 1024,
    };
    const maxSize = maxSizes[type] || 5 * 1024 * 1024;
    
    if (file.size > maxSize) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: `Maximum file size is ${maxSize / (1024 * 1024)}MB`
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${type}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('agency-kyc-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setUrl(fileName);
      const labels: Record<string, string> = {
        company: 'Company incorporation file',
        passport: 'Passport',
        articles: 'Articles of association',
        license: 'Business license',
      };
      toast({ title: `${labels[type]} uploaded successfully` });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation
    if (!formData.full_name || !formData.company_name || !formData.country) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in all required personal information fields'
      });
      return;
    }

    if (!companyDocsUrl) {
      toast({
        variant: 'destructive',
        title: 'Missing documents',
        description: 'Please upload your company incorporation file'
      });
      return;
    }

    if (!passportUrl) {
      toast({
        variant: 'destructive',
        title: 'Missing documents',
        description: 'Please upload your passport for verification'
      });
      return;
    }

    if (!articlesUrl) {
      toast({
        variant: 'destructive',
        title: 'Missing documents',
        description: 'Please upload your articles of association'
      });
      return;
    }

    if (!licenseUrl) {
      toast({
        variant: 'destructive',
        title: 'Missing documents',
        description: 'Please upload your valid business license'
      });
      return;
    }

    // Must have either bank details or crypto details
    const hasBankDetails = formData.bank_account_holder && formData.bank_account_number && formData.bank_name;
    const hasCryptoDetails = formData.usdt_wallet_address && formData.usdt_network;

    if (!hasBankDetails && !hasCryptoDetails) {
      toast({
        variant: 'destructive',
        title: 'Missing payout details',
        description: 'Please provide either bank account details or USDT wallet address'
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('agency_custom_verifications').insert({
        user_id: user.id,
        agency_payout_id: agencyPayoutId,
        full_name: formData.full_name,
        company_name: formData.company_name,
        country: formData.country,
        phone: formData.phone || null,
        company_documents_url: companyDocsUrl,
        passport_url: passportUrl,
        additional_documents_url: JSON.stringify({ articles: articlesUrl, license: licenseUrl }),
        bank_account_holder: formData.bank_account_holder || null,
        bank_account_number: formData.bank_account_number || null,
        bank_name: formData.bank_name || null,
        bank_swift_code: formData.bank_swift_code || null,
        bank_iban: formData.bank_iban || null,
        bank_country: formData.bank_country || null,
        usdt_wallet_address: formData.usdt_wallet_address || null,
        usdt_network: formData.usdt_network || null,
        status: 'pending_review',
        submitted_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Notify admin about the submission
      try {
        await supabase.functions.invoke('notify-admin-custom-verification', {
          body: {
            agency_name: agencyName,
            full_name: formData.full_name,
            company_name: formData.company_name,
            country: formData.country,
          }
        });
      } catch (notifyError) {
        console.error('Failed to notify admin:', notifyError);
        // Non-blocking - continue even if notification fails
      }

      toast({
        title: 'Verification submitted!',
        description: 'Your verification documents are under review. We will notify you once approved.',
        className: 'bg-green-600 text-white border-green-600'
      });

      onSubmitSuccess();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: error.message
      });
    } finally {
      setSubmitting(false);
    }
  };

  const FileUploadBox = ({
    label,
    required,
    file,
    url,
    uploading,
    accept,
    maxSizeLabel,
    onChange,
    onDrop,
  }: {
    label: string;
    required?: boolean;
    file: File | null;
    url: string | null;
    uploading: boolean;
    accept: string;
    maxSizeLabel?: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDrop: (file: File) => void;
  }) => {
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        onDrop(droppedFile);
      }
    };

    return (
      <div className="space-y-2">
        <Label>{label} {required && '*'}</Label>
        <div 
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
            url ? 'border-green-500 bg-green-500/10' : 'border-border hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Uploading...</span>
            </div>
          ) : url ? (
            <div className="flex items-center justify-center gap-2 text-green-500">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm">{file?.name || 'Uploaded'}</span>
            </div>
          ) : (
            <label className="cursor-pointer">
              <input
                type="file"
                accept={accept}
                onChange={onChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Drag & drop or click to upload</span>
                {maxSizeLabel && <span className="text-xs text-muted-foreground">{maxSizeLabel}</span>}
              </div>
            </label>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Personal Information</CardTitle>
            <CardDescription>Provide your personal and company details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Legal Name *</Label>
                <Input
                  id="full_name"
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name">Full Legal Company Name *</Label>
                <Input
                  id="company_name"
                  placeholder="Your Agency Inc."
                  value={formData.company_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country *</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="+1 234 567 8900"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  disabled={submitting}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document Uploads */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Document Verification</CardTitle>
            <CardDescription>Upload required verification documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FileUploadBox
                label="Company Incorporation File"
                required
                file={companyDocsFile}
                url={companyDocsUrl}
                uploading={uploadingCompanyDocs}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                maxSizeLabel="Max 5MB"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setCompanyDocsFile(file);
                    handleFileUpload(file, 'company', setUploadingCompanyDocs, setCompanyDocsUrl);
                  }
                }}
                onDrop={(file) => {
                  setCompanyDocsFile(file);
                  handleFileUpload(file, 'company', setUploadingCompanyDocs, setCompanyDocsUrl);
                }}
              />
              <FileUploadBox
                label="Passport"
                required
                file={passportFile}
                url={passportUrl}
                uploading={uploadingPassport}
                accept=".pdf,.jpg,.jpeg,.png"
                maxSizeLabel="Max 2MB"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPassportFile(file);
                    handleFileUpload(file, 'passport', setUploadingPassport, setPassportUrl);
                  }
                }}
                onDrop={(file) => {
                  setPassportFile(file);
                  handleFileUpload(file, 'passport', setUploadingPassport, setPassportUrl);
                }}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FileUploadBox
                label="Articles of Association"
                required
                file={articlesFile}
                url={articlesUrl}
                uploading={uploadingArticles}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                maxSizeLabel="Max 5MB"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setArticlesFile(file);
                    handleFileUpload(file, 'articles', setUploadingArticles, setArticlesUrl);
                  }
                }}
                onDrop={(file) => {
                  setArticlesFile(file);
                  handleFileUpload(file, 'articles', setUploadingArticles, setArticlesUrl);
                }}
              />
              <FileUploadBox
                label="Valid Business License"
                required
                file={licenseFile}
                url={licenseUrl}
                uploading={uploadingLicense}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                maxSizeLabel="Max 5MB"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setLicenseFile(file);
                    handleFileUpload(file, 'license', setUploadingLicense, setLicenseUrl);
                  }
                }}
                onDrop={(file) => {
                  setLicenseFile(file);
                  handleFileUpload(file, 'license', setUploadingLicense, setLicenseUrl);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank Account Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Bank Account Details</CardTitle>
            <CardDescription>For wire transfer payouts (provide either bank or crypto details)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="bank_account_holder">Beneficiary Name</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground/70 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent 
                      side="right" 
                      align="start"
                      sideOffset={8}
                      collisionPadding={16}
                      avoidCollisions={true}
                      className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg break-words"
                    >
                      <p>Beneficiary Name should be the official company name as per incorporation file.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="bank_account_holder"
                  placeholder="Company Name Ltd."
                  value={formData.bank_account_holder}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_account_holder: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_name">Bank Name</Label>
                <Input
                  id="bank_name"
                  placeholder="Bank of Example"
                  value={formData.bank_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account_number">Account Number</Label>
                <Input
                  id="bank_account_number"
                  placeholder="1234567890"
                  value={formData.bank_account_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_account_number: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_iban">IBAN (if applicable)</Label>
                <Input
                  id="bank_iban"
                  placeholder="GB82WEST12345698765432"
                  value={formData.bank_iban}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_iban: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_swift_code">SWIFT/BIC Code</Label>
                <Input
                  id="bank_swift_code"
                  placeholder="EXAMPLEXXX"
                  value={formData.bank_swift_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_swift_code: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_country">Bank Country</Label>
                <Select
                  value={formData.bank_country}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, bank_country: value }))}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Crypto Payout Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">USDT Wallet Details</CardTitle>
            <CardDescription>For cryptocurrency payouts (provide either bank or crypto details)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="usdt_wallet_address">USDT Wallet Address</Label>
                <Input
                  id="usdt_wallet_address"
                  placeholder="Your USDT wallet address"
                  value={formData.usdt_wallet_address}
                  onChange={(e) => setFormData(prev => ({ ...prev, usdt_wallet_address: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usdt_network">Network</Label>
                <Select
                  value={formData.usdt_network}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, usdt_network: value }))}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select network" />
                  </SelectTrigger>
                  <SelectContent>
                    {USDT_NETWORKS.map((network) => (
                      <SelectItem key={network.value} value={network.value}>{network.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Please double-check your wallet address and network. Sending to the wrong address or network may result in permanent loss of funds.
              </p>
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          disabled={submitting || uploadingCompanyDocs || uploadingPassport || uploadingArticles || uploadingLicense}
          className="w-full bg-black hover:bg-black/80 text-white"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            'Submit Verification'
          )}
        </Button>
      </form>
    </div>
  );
}
