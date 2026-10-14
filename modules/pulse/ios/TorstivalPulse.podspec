Pod::Spec.new do |s|
  s.name = 'TorstivalPulse'
  s.version = '1.0.0'
  s.summary = 'Local flashlight pulses for Torstival'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Torstival'
  s.homepage = 'https://expo.dev'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
