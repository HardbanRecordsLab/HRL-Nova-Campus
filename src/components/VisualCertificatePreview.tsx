import React, { forwardRef } from 'react';
import { Award, ShieldCheck, QrCode, Shield, CheckCircle } from 'lucide-react';

interface VisualCertificatePreviewProps {
  template: 'minimalist' | 'cyber' | 'diploma' | 'luxury';
  studentName: string;
  courseTitle: string;
  issueDate: string;
  certificateCode: string;
}

export const VisualCertificatePreview = forwardRef<HTMLDivElement, VisualCertificatePreviewProps>(
  ({ template, studentName, courseTitle, issueDate, certificateCode }, ref) => {
    
    // ----------------------------------------------------
    // 1. MINIMALIST
    // ----------------------------------------------------
    if (template === 'minimalist') {
      return (
        <div ref={ref} className="w-[600px] h-[848px] bg-white p-6 relative select-none flex flex-col justify-between items-center text-center">
          {/* Subtle outer double border */}
          <div className="absolute inset-4 border-[1px] border-[#d4af37]/50 pointer-events-none" />
          <div className="absolute inset-[20px] border-[1px] border-[#d4af37] pointer-events-none" />
          
          <div className="mt-12 space-y-2 flex flex-col items-center w-full">
            <Award className="w-12 h-12 text-[#d4af37] mb-2" strokeWidth={1} />
            <h1 className="text-xl font-sans tracking-[0.4em] uppercase text-zinc-800 font-medium">HRL Academy</h1>
            
            <div className="pt-16 pb-12 w-full">
              <h2 className="text-[32px] font-sans text-zinc-900 tracking-widest font-light mb-1">CERTYFIKAT</h2>
              <span className="text-sm tracking-[0.3em] text-zinc-500 uppercase">Ukończenia</span>
            </div>
            
            <p className="text-[10px] tracking-[0.2em] text-zinc-400 uppercase mb-8">Niniejszym potwierdza się, że</p>
            
            <h3 className="text-3xl font-serif text-zinc-900 mb-8 px-8">{studentName || "Kamil Skomra"}</h3>
            
            <p className="text-[10px] tracking-[0.2em] text-[#d4af37] uppercase mb-4">Ukończył(a) Kurs</p>
            
            <h4 className="text-xl font-sans text-[#b8860b] px-12 tracking-wider leading-relaxed">
              {courseTitle || "AI Business Automation"}
            </h4>
          </div>

          <div className="w-full px-12 pb-16 flex justify-between items-end z-10">
            <div className="text-left space-y-4">
              <div className="flex gap-8">
                <div>
                  <p className="text-[8px] uppercase tracking-widest text-zinc-400 mb-1">Data</p>
                  <p className="text-[10px] font-mono text-zinc-800">{issueDate}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-widest text-zinc-400 mb-1">ID Certyfikatu</p>
                  <p className="text-[10px] font-mono text-zinc-800">{certificateCode || "HRLA-2024-001"}</p>
                </div>
              </div>
              <div className="pt-6">
                <p className="font-signature text-3xl text-zinc-800 -mb-2 opacity-80" style={{ fontFamily: 'Brush Script MT, cursive' }}>Anna Kowalska</p>
                <div className="h-[1px] w-40 bg-zinc-300 my-2" />
                <p className="text-[8px] uppercase tracking-widest text-zinc-500">Mgr Anna Kowalska</p>
                <p className="text-[8px] uppercase tracking-widest text-zinc-400">Instruktor</p>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-end">
              <p className="text-[8px] uppercase tracking-widest text-zinc-500 mb-2">Zweryfikuj</p>
              <div className="p-2 border border-zinc-200">
                 <QrCode className="w-16 h-16 text-zinc-800" strokeWidth={1} />
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // ----------------------------------------------------
    // 2. CYBER SECURITY
    // ----------------------------------------------------
    if (template === 'cyber') {
      return (
        <div ref={ref} className="w-[600px] h-[848px] bg-[#080d19] p-8 relative select-none flex flex-col justify-between items-center text-center overflow-hidden">
          {/* Cyber lines and glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0e1a33]/20 to-transparent pointer-events-none" />
          <div className="absolute inset-4 border border-[#00e5ff]/30 pointer-events-none" />
          <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-[#00e5ff] pointer-events-none" />
          <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-[#00e5ff] pointer-events-none" />
          <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-[#00e5ff] pointer-events-none" />
          <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-[#00e5ff] pointer-events-none" />
          
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,229,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,229,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

          <div className="mt-12 space-y-2 flex flex-col items-center w-full z-10">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-8 h-8 text-[#00e5ff]" strokeWidth={1.5} />
              <h1 className="text-xl font-sans tracking-[0.3em] uppercase text-white font-medium">HRL Academy</h1>
            </div>
            
            <div className="pt-10 pb-8 w-full">
              <h2 className="text-[36px] font-mono text-[#00e5ff] font-bold tracking-wider mb-2 drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]">CERTYFIKAT</h2>
              <span className="text-sm font-mono tracking-[0.3em] text-white/70 uppercase">Ukończenia</span>
            </div>
            
            <p className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-8">Niniejszym potwierdza się, że</p>
            
            <h3 className="text-4xl font-sans text-white mb-8 px-8 tracking-widest">{studentName || "Kamil Skomra"}</h3>
            
            <p className="text-[10px] font-mono tracking-[0.2em] text-[#00e5ff]/70 uppercase mb-4">Ukończył(a) Kurs</p>
            
            <h4 className="text-xl font-mono text-[#00e5ff] px-12 tracking-widest leading-relaxed drop-shadow-[0_0_5px_rgba(0,229,255,0.5)]">
              {courseTitle || "CYBER SECURITY SPECIALIST"}
            </h4>
          </div>

          <div className="w-full px-8 pb-12 z-10">
            <div className="flex justify-between items-end border-t border-[#00e5ff]/20 pt-6">
              <div className="text-left space-y-6">
                <div className="flex gap-10">
                  <div>
                    <p className="text-[8px] font-mono uppercase tracking-widest text-[#00e5ff]/60 mb-1">Data</p>
                    <p className="text-[10px] font-mono text-white/90">{issueDate}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-mono uppercase tracking-widest text-[#00e5ff]/60 mb-1">Certyfikat ID</p>
                    <p className="text-[10px] font-mono text-white/90">{certificateCode || "HRLA-CS-2024-7821"}</p>
                  </div>
                </div>
                
                <div>
                    <p className="text-[8px] font-mono uppercase tracking-widest text-[#00e5ff]/60 mb-1">Blockchain Hash</p>
                    <p className="text-[9px] font-mono text-white/70">0x1A3F...B4C6D9EFF8A2C3B4D5E6F7AA89C0</p>
                </div>
                
                <div className="pt-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#00e5ff] font-bold">Status</span>
                  </div>
                  <div className="flex items-center gap-2 border border-[#00e5ff]/40 bg-[#00e5ff]/10 px-3 py-1.5 w-max">
                     <CheckCircle className="w-3 h-3 text-[#00e5ff]" />
                     <span className="text-[10px] font-mono uppercase tracking-widest text-[#00e5ff] font-bold">Verified</span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col flex-end text-right items-end justify-between h-full space-y-6">
                <div className="p-1 border border-[#00e5ff]/50 bg-[#00e5ff]/5 backdrop-blur-sm -mt-2">
                   <QrCode className="w-14 h-14 text-[#00e5ff]" strokeWidth={1} />
                </div>
                
                <div className="pt-2">
                  <p className="font-signature text-2xl text-white/80 -mb-1" style={{ fontFamily: 'Brush Script MT, cursive' }}>Anna Kowalska</p>
                  <div className="h-[1px] w-40 bg-[#00e5ff]/30 my-1" />
                  <p className="text-[8px] font-mono uppercase tracking-widest text-zinc-500">MGR ANNA KOWALSKA (INSTRUCTOR)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // ----------------------------------------------------
    // 3. DIPLOMA UNIVERSITY
    // ----------------------------------------------------
    if (template === 'diploma') {
      return (
        <div ref={ref} className="w-[600px] h-[848px] bg-[#fdfbf6] p-4 relative select-none flex flex-col justify-between items-center text-center border-8 border-double border-[#e3d5b8]">
          <div className="absolute inset-4 border border-[#b89c50]/40 pointer-events-none" />
          
          {/* Subtle ornate background texture */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-[#e6dcc8]/30 pointer-events-none" />

          <div className="mt-16 space-y-2 flex flex-col items-center w-full z-10">
            <Shield className="w-14 h-14 text-[#b89c50] fill-[#b89c50]/10 mb-4" strokeWidth={1} />
            
            <div className="pb-10 w-full">
              <h2 className="text-[42px] font-serif text-zinc-900 font-bold tracking-widest mb-1">DIPLOMA</h2>
              <span className="text-sm font-serif tracking-[0.4em] text-[#b89c50] uppercase">Of Completion</span>
            </div>
            
            <p className="text-[11px] font-serif tracking-[0.2em] text-zinc-600 uppercase mb-8">This certifies that</p>
            
            <h3 className="text-4xl font-serif text-zinc-900 mb-8 px-8 border-b border-zinc-300 pb-4 inline-block">{studentName || "Kamil Skomra"}</h3>
            
            <p className="text-[10px] font-serif tracking-[0.2em] text-zinc-500 uppercase mb-4">Has successfully completed the program</p>
            
            <h4 className="text-2xl font-serif text-zinc-900 px-12 tracking-wide font-medium leading-relaxed drop-shadow-sm">
              {courseTitle || "Advanced Business Management"}
            </h4>
            
            <span className="mt-2 text-xs font-serif italic text-[#b89c50]">With Honors</span>
          </div>

          <div className="w-full px-12 pb-16 z-10 mt-auto">
            <div className="flex justify-between items-end mb-12">
               <div>
                  <p className="text-[9px] font-serif uppercase tracking-widest text-zinc-400 mb-1 border-b border-zinc-200 pb-1">Date of Issue</p>
                  <p className="text-xs font-serif text-zinc-800">{issueDate}</p>
               </div>
               <div>
                  <p className="text-[9px] font-serif uppercase tracking-widest text-[#b89c50] mb-1">ID</p>
                  <p className="text-[10px] font-mono text-zinc-600">{certificateCode || "HRLA-DIP-2024-1147"}</p>
               </div>
            </div>
            
            <div className="flex justify-between items-end">
              <div className="text-center">
                <p className="font-signature text-2xl text-zinc-800 -mb-2 opacity-80" style={{ fontFamily: 'Brush Script MT, cursive' }}>Anna Kowalska</p>
                <div className="h-[1px] w-32 bg-zinc-400 my-2" />
                <p className="text-[8px] font-serif uppercase tracking-widest text-zinc-600">Anna Kowalska</p>
                <p className="text-[7px] font-serif uppercase tracking-widest text-zinc-400">Academic Director</p>
              </div>
              
              <div className="w-16 h-16 rounded-full border-2 border-[#b89c50] flex items-center justify-center -translate-y-2">
                 <Shield className="w-8 h-8 text-[#b89c50]" strokeWidth={1} />
              </div>
              
              <div className="text-center">
                <p className="font-signature text-2xl text-zinc-800 -mb-2 opacity-80" style={{ fontFamily: 'Brush Script MT, cursive' }}>Michal Rogowski</p>
                <div className="h-[1px] w-32 bg-zinc-400 my-2" />
                <p className="text-[8px] font-serif uppercase tracking-widest text-zinc-600">Michal Rogowski</p>
                <p className="text-[7px] font-serif uppercase tracking-widest text-zinc-400">Board Member</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // ----------------------------------------------------
    // 4. BLACK LUXURY
    // ----------------------------------------------------
    return (
      <div ref={ref} className="w-[600px] h-[848px] bg-[#0c0c0c] p-6 relative select-none flex flex-col justify-between items-center text-center">
        {/* Ornate Gold Border */}
        <div className="absolute inset-[15px] border-2 border-[#c5a059] pointer-events-none" />
        <div className="absolute inset-[20px] border-[1px] border-[#c5a059]/50 pointer-events-none" />
        
        {/* Subtle dark radial glow behind center */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1e1a0f] via-transparent to-transparent pointer-events-none" />

        <div className="mt-14 space-y-2 flex flex-col items-center w-full z-10">
          <h1 className="text-3xl font-serif tracking-[0.2em] uppercase text-[#c5a059] font-medium mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">HRL</h1>
          <p className="text-xs font-sans tracking-[0.4em] uppercase text-zinc-400">Academy</p>
          
          <div className="pt-16 pb-12 w-full">
            <h2 className="text-[40px] font-serif text-[#c5a059] tracking-widest font-bold mb-2">CERTYFIKAT</h2>
            <span className="text-xs font-sans tracking-[0.4em] text-zinc-400 uppercase">Ukończenia</span>
          </div>
          
          <p className="text-[10px] font-sans tracking-[0.2em] text-zinc-500 uppercase mb-8">Niniejszym potwierdza się, że</p>
          
          <h3 className="text-[38px] font-serif text-white mb-8 px-8 border-b-2 border-[#c5a059]/30 pb-4 inline-block">{studentName || "Kamil Skomra"}</h3>
          
          <p className="text-[10px] font-sans tracking-[0.2em] text-[#c5a059]/80 uppercase mb-4">Ukończył(a) Kurs</p>
          
          <h4 className="text-2xl font-serif text-[#c5a059] px-12 tracking-wider leading-relaxed font-semibold drop-shadow-[0_2px_5px_rgba(197,160,89,0.3)]">
            {courseTitle || "VIP Leadership Program"}
          </h4>
        </div>

        <div className="w-full px-12 pb-16 z-10 mt-auto">
           <div className="flex justify-between items-center mb-10 text-left border-y border-[#c5a059]/20 py-4">
              <div>
                 <p className="text-[8px] font-sans uppercase tracking-widest text-[#c5a059]/70 mb-1">Data</p>
                 <p className="text-[11px] font-serif text-white/90">{issueDate}</p>
              </div>
              <div className="text-right">
                 <p className="text-[8px] font-sans uppercase tracking-widest text-[#c5a059]/70 mb-1">ID Certyfikatu</p>
                 <p className="text-[11px] font-serif text-white/90 tracking-widest">{certificateCode || "HRLA-VIP-2024-0099"}</p>
              </div>
           </div>
           
           <div className="flex justify-between items-center text-left">
             <div>
               <p className="font-signature text-3xl text-[#c5a059] -mb-1 opacity-90" style={{ fontFamily: 'Brush Script MT, cursive' }}>Anna Kowalska</p>
               <div className="h-[1px] w-32 bg-[#c5a059]/50 my-1" />
               <p className="text-[9px] font-sans uppercase tracking-widest text-zinc-400">Instruktor</p>
             </div>
             
             {/* Gold seal */}
             <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#ffd700] via-[#c5a059] to-[#8b6508] p-1 shadow-[0_0_20px_rgba(197,160,89,0.4)]">
                <div className="w-full h-full rounded-full border border-white/30 bg-[#c5a059] flex items-center justify-center flex-col shadow-inner">
                   <Award className="w-8 h-8 text-black/50 mb-0.5" strokeWidth={1} />
                   <p className="text-[6px] font-serif tracking-widest text-black/70 font-bold uppercase">VIP Status</p>
                </div>
             </div>
           </div>
        </div>
      </div>
    );
  }
);

VisualCertificatePreview.displayName = 'VisualCertificatePreview';

