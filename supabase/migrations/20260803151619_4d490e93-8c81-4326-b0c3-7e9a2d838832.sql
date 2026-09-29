CREATE POLICY "blog images readable by everyone" ON storage.objects FOR SELECT USING (bucket_id = 'blog-images');
CREATE POLICY "blog images upload by authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'blog-images');
CREATE POLICY "blog images update by authenticated" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'blog-images') WITH CHECK (bucket_id = 'blog-images');
CREATE POLICY "blog images delete by authenticated" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'blog-images');