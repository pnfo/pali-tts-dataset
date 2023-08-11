Here is the output from running the `create-dataset.js` script

```
Total labels => count: 980, length: 3.8 hours, average length: 13.86
Outliers labels => count: 930, length: 3.6 hours, average length: 13.88
Used labels => count: 767, length: 2.7 hours, average length: 12.88
characters=" '(),-.:;?abcdeghijklmnoprstuvxyñāīūḍḷṃṅṇṭ"
characters=" '(),-.:;?xංඅආඉඊඋඌඑඔකඛගඝඞචඡජඣඤටඨඩඪණතථදධනපඵබභමයරලවසහළ්ාිීුූෙො"
speakers={"wdevananda":214,"oshadir":213,"obhasa":149,"lankananda":191}


Total labels => count: 63610, length: 480.0 hours, average length: 27.17
Usable labels => count: 20584, length: 46.9 hours, average length: 8.21
Used labels => count: 8990, length: 20.0 hours, average length: 8.01
{
  paragraph: 3357,
  centered: 739,
  heading: 2423,
  gatha: 2429,
  unindented: 42
}
characters=" '(),-.:;?abcdeghijklmnoprstuvxyñāīūḍḷṃṅṇṭ"
characters=" '(),-.:;?xංඅආඉඊඋඌඑඔකඛගඝඞචඡජඣඤටඨඩඪණතථදධනපඵබභමයරලවසහළ්ාිීුූෙො"
Extracted audio from flac files in 57.90 seconds
```

In the releases you can find the tar archive with all the wav files. You can download it and extract it as follows
```
cat pali_dataset.tar.bz2.part* > pali_dataset.tar.bz2
tar -xjf pali_dataset.tar.bz2
```