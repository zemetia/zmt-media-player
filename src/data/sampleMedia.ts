import { MediaItem } from '../types';

export const SAMPLE_PLAYLIST: MediaItem[] = [
  {
    id: 'sample-oceans',
    title: 'Oceans (Wildlife Nature HD / Full Surround)',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
    resolution: '720p HD',
    duration: 46,
    subtitles: [
      {
        id: 'sub-oceans-id',
        label: 'Bahasa Indonesia',
        language: 'id',
        cues: [
          { id: 1, startTime: 1.0, endTime: 5.5, text: 'Zmt Media Player — Kejernihan Video Definisi Tinggi (HD)', position: 'bottom' },
          { id: 2, startTime: 6.0, endTime: 11.5, text: '[Keterangan Video: Kedalaman Samudra Pasifik]', position: 'top' },
          { id: 3, startTime: 6.0, endTime: 11.5, text: 'Menjelajahi kedalaman samudera dengan tata suara surround dinamis', position: 'bottom' },
          { id: 4, startTime: 12.0, endTime: 17.5, text: 'Kehidupan laut yang megah bergerak anggun di bawah sinar matahari', position: 'bottom' },
          { id: 5, startTime: 18.0, endTime: 24.0, text: '[Teks Visual: Kawanan Delphinidae Melintas]', position: 'top' },
          { id: 6, startTime: 18.0, endTime: 24.0, text: 'Keluarga lumba-lumba meluncur bebas menembus ombak biru', position: 'bottom' },
          { id: 7, startTime: 25.0, endTime: 31.0, text: 'Uji Equalizer 10-Band & Ekstra Boost 300% pada suara deburan ombak', position: 'bottom' },
          { id: 8, startTime: 32.0, endTime: 39.0, text: 'Pengaturan warna dan kecerahan dapat disesuaikan pada menu Video', position: 'bottom' },
          { id: 9, startTime: 40.0, endTime: 45.0, text: 'Nikmati pengalaman menonton sinematik bersama Zmt Media Player', position: 'bottom' },
        ],
      },
      {
        id: 'sub-oceans-en',
        label: 'English (Full)',
        language: 'en',
        cues: [
          { id: 1, startTime: 1.0, endTime: 5.5, text: 'Zmt Media Player — High Definition Video & Audio Engine', position: 'bottom' },
          { id: 2, startTime: 6.0, endTime: 11.5, text: '[On-Screen Caption: Pacific Ocean Depths]', position: 'top' },
          { id: 3, startTime: 6.0, endTime: 11.5, text: 'Journey into the vast mysterious ocean depths with crystal clear sound', position: 'bottom' },
          { id: 4, startTime: 12.0, endTime: 17.5, text: 'Magnificent marine creatures glide effortlessly under golden sunlight', position: 'bottom' },
          { id: 5, startTime: 18.0, endTime: 24.0, text: '[Visual Note: Delphinidae Pod Passing By]', position: 'top' },
          { id: 6, startTime: 18.0, endTime: 24.0, text: 'Pods of playful dolphins race through the turquoise crests', position: 'bottom' },
          { id: 7, startTime: 25.0, endTime: 31.0, text: 'Test your 10-Band Graphic Equalizer and 300% Volume Boost now', position: 'bottom' },
          { id: 8, startTime: 32.0, endTime: 39.0, text: 'Adjust contrast, saturation and aspect ratio in Video Controls', position: 'bottom' },
          { id: 9, startTime: 40.0, endTime: 45.0, text: 'Immersive cinematic playback powered by Zmt Media Player', position: 'bottom' },
        ],
      },
    ],
  },
  {
    id: 'sample-bunny',
    title: 'Big Buck Bunny (1080p FHD Animation / Dual Audio)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.1080p.vp9.webm',
    resolution: '1080p FHD',
    duration: 596,
    subtitles: [
      {
        id: 'sub-bunny-id',
        label: 'Bahasa Indonesia',
        language: 'id',
        cues: [
          { id: 1, startTime: 1.0, endTime: 7.0, text: 'Big Buck Bunny — Animasi Resolusi Penuh 1080p FHD' },
          { id: 2, startTime: 8.0, endTime: 15.0, text: 'Kelinci raksasa bangun di sebuah pagi rimba yang damai' },
          { id: 3, startTime: 16.0, endTime: 24.0, text: 'Menghirup aroma bunga liar diiringi kicauan burung' },
          { id: 4, startTime: 25.0, endTime: 34.0, text: 'Kupu-kupu mungil hinggap perlahan di hidungnya yang lembut' },
          { id: 5, startTime: 35.0, endTime: 45.0, text: 'Di kejauhan, trio tupai jail mulai menyiapkan rencana jahil...' },
          { id: 6, startTime: 46.0, endTime: 58.0, text: 'Gunakan tombol [ / ] untuk mempercepat atau memperlambat video' },
        ],
      },
      {
        id: 'sub-bunny-en',
        label: 'English',
        language: 'en',
        cues: [
          { id: 1, startTime: 1.0, endTime: 7.0, text: 'Big Buck Bunny — Full 1080p FHD Open Movie Project' },
          { id: 2, startTime: 8.0, endTime: 15.0, text: 'A gentle giant rabbit awakens in the serene green forest' },
          { id: 3, startTime: 16.0, endTime: 24.0, text: 'Basking in morning sunshine, wildflowers and calm breeze' },
          { id: 4, startTime: 25.0, endTime: 34.0, text: 'Delicate butterflies flutter peacefully around him' },
          { id: 5, startTime: 35.0, endTime: 45.0, text: 'Meanwhile, mischievous woodland critters plan their ambush...' },
          { id: 6, startTime: 46.0, endTime: 58.0, text: 'Use shortcut keys [ and ] to change video playback speed' },
        ],
      },
    ],
  },
  {
    id: 'sample-bluemoon',
    title: 'View From A Blue Moon (Extreme Sports 720p Action)',
    url: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
    resolution: '720p HD',
    duration: 150,
    subtitles: [
      {
        id: 'sub-moon-id',
        label: 'Bahasa Indonesia',
        language: 'id',
        cues: [
          { id: 1, startTime: 1.0, endTime: 6.0, text: 'Aksi Olahraga Ekstrem — Visual HD Berkualitas Sinema' },
          { id: 2, startTime: 7.0, endTime: 14.0, text: 'Menantang ombak raksasa di perairan Samudra Pasifik' },
          { id: 3, startTime: 15.0, endTime: 25.0, text: 'Suara bass dinamis siap menguji kemampuan DSP Boost Zmt Player' },
          { id: 4, startTime: 26.0, endTime: 35.0, text: 'Kecepatan dan presisi atlet selancar kelas dunia' },
        ],
      },
      {
        id: 'sub-moon-en',
        label: 'English',
        language: 'en',
        cues: [
          { id: 1, startTime: 1.0, endTime: 6.0, text: 'Action Sports Feature — High Definition Cinema Trailer' },
          { id: 2, startTime: 7.0, endTime: 14.0, text: 'Chasing gigantic swells across the open Pacific waters' },
          { id: 3, startTime: 15.0, endTime: 25.0, text: 'Intense bass soundtrack to test your DSP Volume Booster' },
          { id: 4, startTime: 26.0, endTime: 35.0, text: 'World-class surfers conquering legendary waves' },
        ],
      },
    ],
  },
  {
    id: 'sample-flower',
    title: 'Flower Blooming Timelapse (Macro HD Demo)',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    resolution: '720p HD',
    duration: 5,
    subtitles: [
      {
        id: 'sub-flower-id',
        label: 'Bahasa Indonesia',
        language: 'id',
        cues: [
          { id: 1, startTime: 0.5, endTime: 4.8, text: 'Bunga mekar — Video Makro Cepat HD' },
        ],
      },
      {
        id: 'sub-flower-en',
        label: 'English',
        language: 'en',
        cues: [
          { id: 1, startTime: 0.5, endTime: 4.8, text: 'Blooming Flower — Macro HD Timelapse Sequence' },
        ],
      },
    ],
  },
];
