using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class MakeIcon
{
    static Bitmap DrawIconBitmap(int size)
    {
        Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            float s = size / 64f;

            // Fundo circular com gradiente Gemini/OpenAI
            using (LinearGradientBrush br = new LinearGradientBrush(
                new PointF(0, 0), new PointF(size, size),
                Color.FromArgb(255, 66, 133, 244),
                Color.FromArgb(255, 16, 163, 127)))
            {
                g.FillEllipse(br, 2 * s, 2 * s, 60 * s, 60 * s);
            }

            // Cabeça do robô
            using (SolidBrush brHead = new SolidBrush(Color.FromArgb(255, 15, 23, 42)))
            {
                g.FillRectangle(brHead, 14 * s, 20 * s, 36 * s, 28 * s);
            }

            // Telinha azul brilhante
            using (SolidBrush brScreen = new SolidBrush(Color.FromArgb(255, 124, 244, 255)))
            {
                g.FillEllipse(brScreen, 20 * s, 28 * s, 8 * s, 8 * s);
                g.FillEllipse(brScreen, 36 * s, 28 * s, 8 * s, 8 * s);
            }

            // Antena com estrela/luz
            using (Pen pen = new Pen(Color.FromArgb(255, 255, 255, 255), 3 * s))
            {
                g.DrawLine(pen, 32 * s, 20 * s, 32 * s, 10 * s);
            }
            using (SolidBrush brStar = new SolidBrush(Color.FromArgb(255, 255, 220, 80)))
            {
                g.FillEllipse(brStar, 28 * s, 6 * s, 8 * s, 8 * s);
            }
        }
        return bmp;
    }

    static void Main(string[] args)
    {
        string outDir = args.Length > 0 ? Path.GetFullPath(args[0]) : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "assets");
        Directory.CreateDirectory(outDir);
        string icoPath = Path.Combine(outDir, "icon.ico");

        int[] sizes = new int[] { 16, 32, 48, 64, 128, 256 };
        using (FileStream fs = new FileStream(icoPath, FileMode.Create))
        using (BinaryWriter bw = new BinaryWriter(fs))
        {
            // ICONDIR
            bw.Write((short)0); // reserved
            bw.Write((short)1); // icon type
            bw.Write((short)sizes.Length); // count

            byte[][] pngBytes = new byte[sizes.Length][];
            for (int i = 0; i < sizes.Length; i++)
            {
                using (Bitmap bmp = DrawIconBitmap(sizes[i]))
                using (MemoryStream ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Png);
                    pngBytes[i] = ms.ToArray();
                }
            }

            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++)
            {
                int sz = sizes[i];
                bw.Write((byte)(sz >= 256 ? 0 : sz)); // width
                bw.Write((byte)(sz >= 256 ? 0 : sz)); // height
                bw.Write((byte)0); // color count
                bw.Write((byte)0); // reserved
                bw.Write((short)1); // color planes
                bw.Write((short)32); // bit count
                bw.Write((int)pngBytes[i].Length); // size
                bw.Write((int)offset); // offset
                offset += pngBytes[i].Length;
            }

            for (int i = 0; i < sizes.Length; i++)
            {
                bw.Write(pngBytes[i]);
            }
        }
        Console.WriteLine("ICON_OK:" + icoPath);
    }
}
